//! Stars: a limb-darkened, granulated disc with spots, and a corona of glow and streamers (AD-149: the corona is a parameter).
use super::utile::*;
use super::Ctx;

pub fn rendre(c: &Ctx) -> Vec<Px> {
    let n = c.cote;
    let echelle = borne(c.f("echelle", 0.4), 0.15, 0.7);
    let r = c.demi * echelle;
    // A star gone is a dull remnant: no corona, no rays, no halo, the disc at a fifth of its brightness.
    let disparue = c.asp.get("disparue").and_then(serde_json::Value::as_bool).unwrap_or(false);
    let couronne = if disparue { 0.0 } else { borne(c.f("couronne", 0.7), 0.0, 2.0) };
    let gran = borne(c.f("granulation", 1.0), 0.0, 3.0);
    let taches = borne(c.f("taches", 0.5), 0.0, 1.0);
    let rayons = borne(c.f("rayons", 7.0), 0.0, 24.0);
    let halo = if disparue { 0.0 } else { borne(c.f("halo", 0.0), 0.0, 2.0) };
    let (c0, c1, c2) = (c.pal_i(0), c.pal_i(1), c.pal_i(2));
    let br = c.bruit;
    let oct = if c.cote <= 64 { 3 } else { 4 };
    let mut g = Flux(c.graine);
    let phase = g.entre(0.0, 40.0);
    let rot = g.entre(0.0, 6.28);
    let rayon_rel = c.demi / r;
    let mut sortie = vec![[0.0f32; 4]; n * n];
    for y in 0..n {
        for x in 0..n {
            let dx = x as f32 + 0.5 - c.demi;
            let dy = y as f32 + 0.5 - c.demi;
            let d = (dx * dx + dy * dy).sqrt();
            let u = d / r;
            let mut px: Px = [0.0; 4];
            // Corona: a tight glow, a wide soft one, and streamers that wander with the angle.
            if u > 0.85 {
                let th = dy.atan2(dx) + rot;
                let k = (u - 1.0).max(0.0);
                let fl = br.valeur([th.cos() * rayons.max(1.0) * 0.5 + phase, th.sin() * rayons.max(1.0) * 0.5, u * 0.35]);
                let fl2 = br.valeur([th.cos() * rayons.max(1.0) * 1.3, th.sin() * rayons.max(1.0) * 1.3 + phase, u * 0.2]);
                let stries = 0.45 + 0.9 * fl * (0.6 + 0.8 * fl2);
                let coeur = (-k * 3.4).exp() * 0.95;
                let large = (-k * 0.85).exp() * 0.2 * stries;
                let rai = if rayons > 0.0 { (-k * 1.5).exp() * 0.35 * lisse(0.45, 0.85, fl) * stries } else { 0.0 };
                let bord = 1.0 - lisse(0.62, 1.0, d / c.demi);
                let i = (coeur + large + rai) * couronne * bord * bord * lisse(0.85, 1.0, u);
                let teinte = melange(c1, c0, (-k * 4.0).exp());
                px = lueur(teinte, i);
            }
            if halo > 0.0 && u > 1.0 {
                let k = u - 1.0;
                px = dessus(px, lueur(c1, halo * (-k * 1.6).exp() * 0.4 * (1.0 - lisse(0.6, 1.0, d / c.demi))));
            }
            let cov = borne(r - d + 0.5, 0.0, 1.0);
            if cov > 0.0 {
                let (sx, sy) = if u > 1.0 { (dx / d, dy / d) } else { (dx / r, dy / r) };
                let nz = (1.0 - sx * sx - sy * sy).max(0.0).sqrt();
                // Limb darkening: the centre is the hottest colour, the limb the coolest.
                let t = 1.0 - nz.powf(0.55);
                let mut col = if t < 0.5 { melange(c0, c1, t * 2.0) } else { melange(c1, c2, (t - 0.5) * 2.0) };
                let p = [sx * 3.0 + phase, sy * 3.0, nz * 3.0];
                if gran > 0.0 {
                    let (f1, f2, _) = br.cellules([p[0] * 2.5, p[1] * 2.5, p[2] * 2.5]);
                    let cell = lisse(0.0, 0.55, f2 - f1);
                    let mott = br.fbm([p[0] * 0.8, p[1] * 0.8, p[2] * 0.8], oct);
                    let k = 1.0 + gran * (0.16 * (cell - 0.5) + 0.22 * (mott - 0.5));
                    col = mul(col, k);
                }
                if taches > 0.0 {
                    let s = br.fbm([p[0] * 0.6 + 4.0, p[1] * 0.6, p[2] * 0.6], 3);
                    let seuil = 0.77 - 0.06 * taches;
                    let ombre = lisse(seuil, seuil + 0.07, s);
                    let umbre = lisse(seuil + 0.05, seuil + 0.1, s);
                    col = mul(col, 1.0 - 0.35 * ombre - 0.3 * umbre);
                    // Faculae brighten the limb around the spots.
                    col = mul(col, 1.0 + 0.12 * lisse(0.4, 0.7, s) * (1.0 - nz) * 2.0);
                }
                col = mul(col, 1.06);
                if disparue {
                    // A fifth of the brightness as the eye reads it (the output is encoded: 0.2 squared before the encoding).
                    col = mul(col, 0.04);
                }
                let corps: Px = [col[0] * cov, col[1] * cov, col[2] * cov, cov];
                px = dessus(corps, px);
            }
            let _ = rayon_rel;
            sortie[y * n + x] = px;
        }
    }
    sortie
}
