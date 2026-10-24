import {
  Body,
  Controller,
  Logger,
  Get,
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
import { ChatService, toMessageDto, toSessionDto } from './chat.service';
import { SendMessageDto } from './send-message.dto';

type AuthedRequest = Request & { user?: { sub?: string } };

const ownerOf = (req: AuthedRequest) => req.user?.sub ?? null;

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat/sessions')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly agent: AgentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List chat sessions, newest first' })
  async list(@Req() req: AuthedRequest): Promise<ChatSessionDto[]> {
    return (await this.chat.listSessions(ownerOf(req))).map(toSessionDto);
  }

  @Post()
  @ApiOperation({ summary: 'Start an empty chat session' })
  async create(@Req() req: AuthedRequest): Promise<ChatSessionDto> {
    return toSessionDto(await this.chat.createSession(ownerOf(req)));
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
      emit({ type: 'session', session: toSessionDto(session) });
      emit({ type: 'user', message: toMessageDto(userMessage) });

      const { answer, thinking } = await this.agent.run(
        await this.chat.history(id),
        { sessionId: id },
        (delta) => {
          emit({ type: 'thinking', delta });
        },
      );
      const reply = await this.chat.addAssistantMessage(id, answer, thinking);
      emit({ type: 'assistant', message: toMessageDto(reply) });
      // The agent may have renamed the session (renameSession).
      emit({
        type: 'session',
        session: toSessionDto(await this.chat.getSession(id, ownerOf(req))),
      });
    } catch (err) {
      this.logger.error(err);
      emit({ type: 'error', message: (err as Error).message || 'AI request failed' });
    } finally {
      res.end();
    }
  }
}
