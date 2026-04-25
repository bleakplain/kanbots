import { useRoute } from './hooks/useRoute.js';
import { Board } from './pages/Board.js';
import { IssueDetail } from './pages/IssueDetail.js';

export function App() {
  const route = useRoute();

  if (route.name === 'issue') {
    return <IssueDetail number={route.number} />;
  }
  return <Board />;
}
