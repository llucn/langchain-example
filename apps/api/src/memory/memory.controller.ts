import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminMemory, AdminMemoryPage, Memory } from '@app/shared';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { AdminMemoryQueryDto, MemoryContentDto } from './memory.dto';
import { MemoryService, toMemoryDto } from './memory.service';

type AuthedRequest = Request & { user?: Record<string, unknown> & { sub?: string } };

const ownerOf = (req: AuthedRequest) => req.user?.sub ?? null;

@ApiTags('memory')
@ApiBearerAuth()
@Controller('memories')
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  @ApiOperation({ summary: 'My memories, newest first' })
  async list(@Req() req: AuthedRequest): Promise<Memory[]> {
    return (await this.memories.list(ownerOf(req))).map(toMemoryDto);
  }

  @Post()
  @ApiOperation({ summary: 'Add a memory' })
  async create(@Body() dto: MemoryContentDto, @Req() req: AuthedRequest): Promise<Memory> {
    return toMemoryDto(await this.memories.create(ownerOf(req), dto.content));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my memories' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MemoryContentDto,
    @Req() req: AuthedRequest,
  ): Promise<Memory> {
    return toMemoryDto(await this.memories.update(ownerOf(req), id, dto.content));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one of my memories' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest): Promise<void> {
    await this.memories.remove(ownerOf(req), id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/memories')
export class AdminMemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  @ApiOperation({ summary: 'All users memories, newest first, optionally filtered by owner email' })
  list(@Query() query: AdminMemoryQueryDto): Promise<AdminMemoryPage> {
    return this.memories.listAll(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit any memory' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MemoryContentDto,
  ): Promise<AdminMemory> {
    return this.memories.adminUpdate(id, dto.content);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete any memory' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.memories.adminRemove(id);
  }
}
