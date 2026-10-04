import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { FournisseurCadre } from './cadre-contexte';
import { Cadre } from './Cadre';
import { ecrans } from './registre';
import { PageIntrouvable } from './ui';

// One router (AD-16): every registered screen inside the frame, then « Page introuvable. ».
const routeur = createBrowserRouter([
  {
    element: (
      <FournisseurCadre>
        <Cadre />
      </FournisseurCadre>
    ),
    children: [
      ...ecrans.map((e) => ({ path: e.chemin, Component: e.composant })),
      { path: '*', Component: PageIntrouvable },
    ],
  },
]);

export function App() {
  return <RouterProvider router={routeur} />;
}
