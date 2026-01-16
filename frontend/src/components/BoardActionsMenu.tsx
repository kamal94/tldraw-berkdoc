import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
} from 'tldraw';
import { useNavigate, useParams } from 'react-router';
import { useBoards } from '../hooks/useBoards';

export function BoardMainMenu() {
  const navigate = useNavigate();
  const { boardId } = useParams();
  const { boards } = useBoards();

  const otherBoards = boards.filter((board) => board.id !== boardId);


  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="boards">
        <TldrawUiMenuItem
          id="boards-home"
          icon="menu"
          label="Boards"
          onSelect={() => navigate('/')}
        />
        {otherBoards.map((board) => (
          <TldrawUiMenuItem
            key={board.id}
            id={`switch-board-${board.id}`}
            icon="list"
            label={`Switch to ${board.name}`}
            onSelect={() => navigate(`/board/${board.id}`)}
          />
        ))}
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  );
}
