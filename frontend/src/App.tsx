import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { FournisseurCadre } from './cadre-contexte';
import { Cadre } from './Cadre';
import { FournisseurTypes } from './types-contexte';
import { ecrans } from './registre';
import { FournisseurToasts, PageIntrouvable } from './ui';

// One router (AD-16): every registered screen inside the frame, then « Page introuvable. ».
const routeur = createBrowserRouter([
  {
    element: (
      <FournisseurCadre>
        <FournisseurTypes>
          <FournisseurToasts>
            <Cadre />
          </FournisseurToasts>
        </FournisseurTypes>
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
