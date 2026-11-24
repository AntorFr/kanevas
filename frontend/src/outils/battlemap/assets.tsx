import { Navigate } from 'react-router-dom';

import type { PropsOutil } from '../types';

/** The library has its own screen (`ecrans/battlemap-assets.tsx`, E-25): this component is only the generic route's way there. */
export default function Assets({ universId }: PropsOutil) {
  return <Navigate to={`/univers/${universId}/outils/battlemap/assets`} replace />;
}
