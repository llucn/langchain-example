import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ChatLogReview as ChatLogReviewDto,
  ChatLogSessionDetail,
  ChatLogSessionPage,
} from '@app/shared';
import { Roles } from '../auth/roles.decorator';
import { ListSessionsQueryDto, SaveReviewDto } from './chat-log-review.dto';
import { ChatLogReviewService, type Reviewer } from './chat-log-review.service';
import { logUserOf } from './chat-log.service';

type AuthedRequest = { user?: Record<string, unknown> };

/** `anonymous` when authentication is disabled, so the one-review-per-reviewer rule still holds. */
const reviewerOf = (req: AuthedRequest): Reviewer => {
  const u = logUserOf(req.user);
  return { sub: u.sub ?? 'anonymous', name: u.name };
};

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/chat-logs')
export class ChatLogReviewController {
  constructor(private readonly review: ChatLogReviewService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Logged chat sessions, newest first, with review counts' })
  sessions(@Query() query: ListSessionsQueryDto): Promise<ChatLogSessionPage> {
    return this.review.listSessions(query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'A logged session with all its events and reviews' })
  session(@Param('id', ParseUUIDPipe) id: string): Promise<ChatLogSessionDetail> {
    return this.review.getSession(id);
  }

  @Put('sessions/:id/review')
  @ApiOperation({ summary: "Create or update the caller's review of a session" })
  reviewSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReviewDto,
    @Req() req: AuthedRequest,
  ): Promise<ChatLogReviewDto> {
    return this.review.saveReview({ kind: 'session', id }, dto, reviewerOf(req));
  }

  @Delete('sessions/:id/review')
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the caller's review of a session" })
  unreviewSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.review.deleteReview({ kind: 'session', id }, reviewerOf(req));
  }

  @Put('messages/:id/review')
  @ApiOperation({ summary: "Create or update the caller's review of a message event" })
  reviewMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReviewDto,
    @Req() req: AuthedRequest,
  ): Promise<ChatLogReviewDto> {
    return this.review.saveReview({ kind: 'message', id }, dto, reviewerOf(req));
  }

  @Delete('messages/:id/review')
  @HttpCode(204)
  @ApiOperation({ summary: "Remove the caller's review of a message event" })
  unreviewMessage(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.review.deleteReview({ kind: 'message', id }, reviewerOf(req));
  }
}
