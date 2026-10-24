import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ChatMessage as ChatMessageDto,
  ChatSession as ChatSessionDto,
  ChatStreamEvent,
} from '@app/shared';
import type { Request, Response } from 'express';
import { ChatService, toMessageDto, toSessionDto } from './chat.service';
import { SendMessageDto } from './send-message.dto';

type AuthedRequest = Request & { user?: { sub?: string } };

const ownerOf = (req: AuthedRequest) => req.user?.sub ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat/sessions')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

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

      const { thinking, answer } = this.chat.think(dto.content);
      for (const delta of thinking.match(/\S+\s*|\s+/g) ?? []) {
        emit({ type: 'thinking', delta });
        await sleep(40);
      }
      const reply = await this.chat.addAssistantMessage(id, answer, thinking);
      emit({ type: 'assistant', message: toMessageDto(reply) });
    } finally {
      res.end();
    }
  }
}
