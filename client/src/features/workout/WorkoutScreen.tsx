import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

/** Полноэкранная тренировка поверх вкладок; содержимое — этап 2. */
export function WorkoutScreen(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="fullscreen">
      <button type="button" className="htr-btn htr-btn--secondary" onClick={() => navigate(-1)}>Свернуть</button>
      <p className="stub">Тренировка {id}</p>
    </div>
  );
}
