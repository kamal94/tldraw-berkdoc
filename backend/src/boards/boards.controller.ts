import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type CurrentUserData } from '../auth/decorators/current-user.decorator';
import { BoardsService } from './boards.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  async listBoards(@CurrentUser() user: CurrentUserData) {
    return this.boardsService.listBoards(user.id);
  }

  @Post()
  async createBoard(@CurrentUser() user: CurrentUserData, @Body() dto: CreateBoardDto) {
    return this.boardsService.createBoard(user.id, dto.name);
  }

  @Get(':id')
  async getBoard(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.boardsService.getBoardById(id, user.id);
  }

  @Patch(':id')
  async updateBoard(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.updateBoardName(user.id, id, dto.name);
  }

  @Delete(':id')
  async deleteBoard(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.boardsService.deleteBoard(user.id, id);
    return { success: true };
  }
}
