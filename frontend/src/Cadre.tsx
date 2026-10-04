import { Outlet } from 'react-router-dom';

import { useConnexionPerdue } from './api';
import { Barre } from './Barre';
import { Bandeau } from './ui';
import './cadre.css';

const bouchon = typeof document !== 'undefined' && document.querySelector('meta[name="kanevas-bouchon"]') !== null;

/** The frame around every screen: banners, sidebar, content (docs/ecrans.md). */
export function Cadre() {
  const perdue = useConnexionPerdue();
  return (
    <div className="cadre">
      {bouchon && <Bandeau sorte="bouchon">Mode bouchon — les comptes sont fictifs. Ne jamais l’ouvrir en production.</Bandeau>}
      {perdue && (
        <Bandeau sorte="perdue">
          Connexion perdue. Ce que vous voyez peut être dépassé ; rien n’est enregistré tant qu’elle ne revient pas.
        </Bandeau>
      )}
      <div className="corps">
        <Barre />
        <main className="principal">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
