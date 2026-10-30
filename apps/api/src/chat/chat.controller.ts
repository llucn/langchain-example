import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ChatMessage as ChatMessageDto,
  ChatSession as ChatSessionDto,
  ChatStreamEvent,
} from '@app/shared';
import type { Request, Response } from 'express';
import { AgentService } from '../agent/agent.service';
import { ChatLogService, logUserOf } from '../chat-log/chat-log.service';
import { ChatService, toMessageDto, toSessionDto } from './chat.service';
import { SendMessageDto } from './send-message.dto';

type AuthedRequest = Request & { user?: Record<string, unknown> & { sub?: string } };

const bearerOf = (req: Request) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

const ownerOf = (req: AuthedRequest) => req.user?.sub ?? null;

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat/sessions')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly agent: AgentService,
    private readonly chatLog: ChatLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List chat sessions, newest first' })
  async list(@Req() req: AuthedRequest): Promise<ChatSessionDto[]> {
    return (await this.chat.listSessions(ownerOf(req))).map(toSessionDto);
  }

  @Post()
  @ApiOperation({ summary: 'Start an empty chat session' })
  async create(@Req() req: AuthedRequest): Promise<ChatSessionDto> {
    const session = await this.chat.createSession(ownerOf(req));
    await this.chatLog.recordSession(session, logUserOf(req.user));
    return toSessionDto(session);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a chat session and its messages' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest): Promise<void> {
    await this.chat.deleteSession(id, ownerOf(req));
    // The log outlives the session; it only records the deletion.
    await this.chatLog.markDeleted(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Messages of a chat session, oldest first' })
  async messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ): Promise<ChatMessageDto[]> {
    await this.chat.getSession(id, ownerOf(req));
    return (await this.chat.listMessages(id)).map(toMessageDto);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a message; streams `user`, `thinking` and `assistant` events (SSE)',
  })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.chat.getSession(id, ownerOf(req));
    const log = this.chatLog.startRun(session, logUserOf(req.user), session.agent);

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const emit = (e: ChatStreamEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

    try {
      const userMessage = await this.chat.addUserMessage(session, dto.content);
      log.userInput(dto.content, userMessage.id);
      void this.chatLog.touchName(id, session.name);
      emit({ type: 'session', session: toSessionDto(session) });
      emit({ type: 'user', message: toMessageDto(userMessage) });

      const { answer, thinking, agent } = await this.agent.run(
        await this.chat.history(id),
        {
          sessionId: id,
          idToken: bearerOf(req),
          agent: session.agent,
          log,
          // The list shows the new name right away instead of after the whole run.
          onSessionRenamed: async () => {
            const renamed = await this.chat.getSession(id, ownerOf(req));
            void this.chatLog.touchName(id, renamed.name);
            emit({ type: 'session', session: toSessionDto(renamed) });
          },
        },
        (delta) => {
          emit({ type: 'thinking', delta });
        },
      );
      if (agent !== session.agent) await this.chat.setAgent(id, agent);
      const reply = await this.chat.addAssistantMessage(id, answer, thinking);
      log.linkAnswer(reply.id);
      emit({ type: 'assistant', message: toMessageDto(reply) });
      // The agent may have renamed the session (renameSession).
      emit({
        type: 'session',
        session: toSessionDto(await this.chat.getSession(id, ownerOf(req))),
      });
    } catch (err) {
      this.logger.error(err);
      const message = (err as Error).message || 'AI request failed';
      log.error(message, session.agent);
      emit({ type: 'error', message });
    } finally {
      res.end();
      await log.flush();
    }
  }
}
