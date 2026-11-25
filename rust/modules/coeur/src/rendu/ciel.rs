//! The sky families: comet, nebula, asteroid belt and field, anomaly.
use super::utile::*;
use super::Ctx;

/// Fade to transparent toward the border of the square, so that no picture is cut by its frame.
fn cadre(dx: f32, dy: f32, demi: f32) -> f32 {
    let m = dx.abs().max(dy.abs()) / demi;
    1.0 - lisse(0.86, 1.0, m)
}

fn tourne(x: f32, y: f32, a: f32) -> (f32, f32) {
    let (c, s) = (a.cos(), a.sin());
    (x * c - y * s, x * s + y * c)
}

/// A comet: a bright nucleus in its coma, a straight streaky gas tail and a wide curved dust tail.
pub fn comete(c: &Ctx) -> Vec<Px> {
    let n = c.cote;
    let sens = if c.f("sens", 1.0) < 0.0 { -1.0 } else { 1.0 };
    let longueur = borne(c.f("longueur", 0.55), 0.1, 1.0);
    let ouv = borne(c.f("ouverture", 0.25), 0.02, 0.8);
    let tete = borne(c.f("tete", 1.2), 0.3, 3.0);
    let courb = borne(c.f("courbure", 0.45), -1.0, 1.0);
    // The sign bends the tail to the other side: the noise reads the side-corrected coordinate, so −c is +c mirrored.
    let signe = if courb < 0.0 { -1.0f32 } else { 1.0 };
    // Head-on: the tails are foreshortened toward the viewer and spread into a halo round the nucleus.
    let face = c.asp.get("vue").and_then(serde_json::Value::as_str) == Some("face");
    let (raccourci, elargi) = if face { (0.3, 2.4) } else { (1.0, 1.0) };
    let fg = borne(c.f("force_gaz", 0.8), 0.0, 2.0);
    let fp = borne(c.f("force_poussiere", 0.7), 0.0, 2.0);
    let col_t = c.col("couleur", c.pal_i(0));
    let col_g = c.col("gaz", c.pal_i(1));
    let col_p = c.col("poussiere", c.pal_i(2));
    let cote = c.cote as f32;
    let tete_pos = (c.demi + sens * 0.3 * cote, c.demi - 0.22 * cote);
    let dir = norme([-sens * 0.8, 0.6, 0.0]);
    let angle_g = dir[1].atan2(dir[0]);
    let angle_p = angle_g + sens * -courb * 0.3;
    let long = (0.3 + longueur) * cote * 0.95 * raccourci;
    let rn = (cote * 0.022 * tete).max(1.2);
    let br = c.bruit;
    let mut sortie = vec![[0.0f32; 4]; n * n];
    for y in 0..n {
        for x in 0..n {
            let (dx, dy) = (x as f32 + 0.5 - c.demi, y as f32 + 0.5 - c.demi);
            let (rx, ry) = (x as f32 + 0.5 - tete_pos.0, y as f32 + 0.5 - tete_pos.1);
            let mut px: Px = [0.0; 4];
            // Tails.
            for (k, (ang, long_k, col, force, large, courbe)) in [
                (angle_p, long * 0.85, col_p, fp, ouv * 1.1, courb * 0.9),
                (angle_g, long * 1.05, col_g, fg, ouv * 0.38, 0.0),
            ]
            .into_iter()
            .enumerate()
            {
                let (ax, ay) = (ang.cos(), ang.sin());
                let s = rx * ax + ry * ay;
                if s <= 0.0 || s > long_k {
                    continue;
                }
                let u0 = -rx * ay + ry * ax;
                let u = u0 - courbe * s * s / long_k * sens * -0.5;
                let w = (rn * 1.1 + large * s) * elargi;
                let t = s / long_k;
                let fond = (-(u / w).powi(2) * 1.6).exp() * (1.0 - t).powf(1.7);
                let stries = if k == 1 {
                    0.45 + 1.1 * br.fbm([s / (cote * 0.25) + 3.0, signe * u / w * 1.6, 0.5], 3)
                } else {
                    0.65 + 0.7 * br.fbm([s / (cote * 0.4), signe * u / w * 0.9, 9.5], 3)
                };
                let i = fond * stries * force * 1.15;
                px = dessus(px, lueur(col, i));
                px[3] = px[3].min(i.min(1.0).max(px[3]));
            }
            // Coma and nucleus.
            let d = (rx * rx + ry * ry).sqrt();
            let coma = (-(d / (rn * 3.4)).powf(0.9) * 1.5).exp() * 0.75;
            px = dessus(px, lueur(melange(col_t, col_g, 0.35), coma));
            let noy = borne(rn - d + 0.5, 0.0, 1.0);
            if noy > 0.0 {
                let lum = 0.9 + 0.5 * (1.0 - d / rn);
                px = dessus([col_t[0] * lum * noy, col_t[1] * lum * noy, col_t[2] * lum * noy, noy], px);
            }
            // The faint haze of the tails must die out inside the square, never end on its straight edges:
            // a round fade (not the square one) and a knee that cuts the barely visible alpha.
            let rond = 1.0 - lisse(0.6, 0.98, (dx * dx + dy * dy).sqrt() / c.demi);
            let m = cadre(dx, dy, c.demi) * rond;
            let a = px[3] * m;
            let k = if px[3] > 0.0 { (((a - 0.04) / 0.96).max(0.0) / px[3]).min(1.0) } else { 0.0 };
            sortie[y * n + x] = [px[0] * k, px[1] * k, px[2] * k, px[3] * k];
        }
    }
    sortie
}

/// A nebula: warped clouds of the palette, dust lanes, a few embedded stars, a soft round edge.
pub fn nebuleuse(c: &Ctx) -> Vec<Px> {
    let n = c.cote;
    let densite = borne(c.f("densite", 0.6), 0.1, 1.0);
    let etoiles = borne(c.f("etoiles", 0.5), 0.0, 1.0);
    let (c0, c1, c2) = (c.pal_i(0), c.pal_i(1), c.pal_i(2));
    let c0 = c.col("brume", c0);
    let br = c.bruit;
    let oct = if c.cote <= 32 { 3 } else if c.cote <= 128 { 4 } else { 5 };
    let mut sortie = vec![[0.0f32; 4]; n * n];
    let (ox, oy) = (alea(c.graine) * 20.0, alea(hache(c.graine)) * 20.0);
    for y in 0..n {
        for x in 0..n {
            let (dx, dy) = (x as f32 + 0.5 - c.demi, y as f32 + 0.5 - c.demi);
            let (u, v) = (dx / c.demi, dy / c.demi);
            let r = (u * u + v * v).sqrt();
            let masque = 1.0 - lisse(0.55, 1.0, r);
            let mut px: Px = [0.0; 4];
            if masque > 0.0 {
                let p = [u * 1.6 + ox, v * 1.6 + oy, 0.7];
                let q = br.fbm(p, oct);
                let w = br.fbm([p[0] * 1.4 + q * 2.2, p[1] * 1.4 - q * 1.8, 2.3], oct);
                let nuage = lisse(0.5 - 0.25 * densite, 0.85, w);
                let veine = lisse(0.55, 0.8, br.crete([p[0] * 1.8 + 9.0, p[1] * 1.8, 4.1], 3));
                let t = borne(q * 0.9 + (w - 0.5) * 0.8, 0.0, 1.0);
                let mut col = melange(c0, c1, t);
                col = melange(col, c2, lisse(0.62, 0.95, w) * 0.85);
                let chaud = lisse(0.7, 1.0, w);
                col = mul(col, 0.7 + 0.9 * chaud);
                let vide = 1.0 - 0.6 * lisse(0.6, 0.85, br.fbm([p[0] * 2.4 - 5.0, p[1] * 2.4, 1.9], 3)) * (1.0 - chaud);
                let a = borne(nuage * masque * vide * (0.7 + 0.5 * densite) + veine * 0.05 * masque, 0.0, 1.0);
                px = [col[0] * a, col[1] * a, col[2] * a, a];
            }
            sortie[y * n + x] = px;
        }
    }
    // Stars on a coarse grid, a few per picture, each one a small bright point with a halo.
    if etoiles > 0.0 {
        let mut g = Flux(hache(c.graine ^ 0x5eed));
        let nb = (4.0 + 22.0 * etoiles) as usize;
        for _ in 0..nb {
            let (sx, sy) = (g.entre(-0.8, 0.8), g.entre(-0.8, 0.8));
            let (rayon, teinte) = (g.entre(0.5, 1.6), g.suivant());
            if sx * sx + sy * sy > 0.75 {
                continue;
            }
            let col = melange([1.0, 0.95, 0.85], [0.8, 0.9, 1.0], teinte);
            ajoute_point(&mut sortie, n, c.demi + sx * c.demi, c.demi + sy * c.demi, rayon * (c.cote as f32 / 128.0).max(0.7), col, 1.0);
        }
    }
    sortie
}

/// A round soft point, added over the buffer.
fn ajoute_point(buf: &mut [Px], n: usize, cx: f32, cy: f32, r: f32, col: V3, i: f32) {
    let ext = (r * 12.0).ceil() as i32 + 1;
    for y in (cy as i32 - ext).max(0)..=(cy as i32 + ext).min(n as i32 - 1) {
        for x in (cx as i32 - ext).max(0)..=(cx as i32 + ext).min(n as i32 - 1) {
            let d = (((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)) as f32).sqrt();
            let g = (-(d / r).powi(2) * 1.2).exp() * 0.9 + (-(d / (r * 3.0)).powi(2)).exp() * 0.25;
            let p = lueur(col, g * i);
            let b = &mut buf[y as usize * n + x as usize];
            *b = dessus(p, *b);
        }
    }
}

/// A belt (seen as an oblique band of rocks) or a field of asteroids (a loose cloud with a few big ones).
pub fn roches(c: &Ctx, ceinture: bool) -> Vec<Px> {
    let n = c.cote;
    let cote = c.cote as f32;
    let densite = borne(c.f("rochers", 0.8), 0.1, 1.5);
    let mut g = Flux(hache(c.graine ^ 0xa57e));
    let br = c.bruit;
    let ang = g.entre(-0.55, -0.15);
    let a = c.f("lumiere", 135.0).to_radians();
    let l = norme([a.cos() * 0.8, -a.sin() * 0.8, 0.6]);
    let (rx, ry) = (0.78, g.entre(0.26, 0.36));
    let mut sortie = vec![[0.0f32; 4]; n * n];
    let teinte = |i: f32| -> V3 { rampe(&c.pal, i) };
    // A haze of dust under the rocks: the band exists even where the rocks are sub-pixel.
    for y in 0..n {
        for x in 0..n {
            let (dx, dy) = (x as f32 + 0.5 - c.demi, y as f32 + 0.5 - c.demi);
            let (u, v) = (dx / c.demi, dy / c.demi);
            let m = if ceinture {
                let (bx, by) = tourne(u, v, -ang);
                let re = ((bx / rx / 2.0).powi(2) + (by / ry / 2.0).powi(2)).sqrt() * 2.0;
                (-((re - 1.0) / 0.2).powi(2)).exp() * 0.5
            } else {
                (-((u * u + v * v) / 0.22)).exp() * 0.4
            };
            if m > 0.01 {
                let f = br.fbm([u * 3.0, v * 3.0, 0.4], 3);
                let a = m * (0.45 + 0.9 * f) * cadre(dx, dy, c.demi);
                let col = teinte(0.5 + 0.3 * f);
                sortie[y * n + x] = [col[0] * a * 0.55, col[1] * a * 0.55, col[2] * a * 0.55, a * 0.55];
            }
        }
    }
    let nb = (180.0 + 260.0 * densite) as usize;
    let mut roches: Vec<(f32, f32, f32, f32, f32)> = Vec::with_capacity(nb);
    for _ in 0..nb {
        let (cx, cy, rr) = if ceinture {
            let t = g.entre(0.0, 6.2832);
            let ecart = (g.suivant() + g.suivant() + g.suivant() - 1.5) * 0.3;
            let (bx, by) = ((1.0 + ecart) * rx * t.cos(), (1.0 + ecart) * ry * t.sin());
            let (px, py) = tourne(bx, by, ang);
            (px, py, g.entre(0.0, 1.0))
        } else {
            let (a1, a2) = (g.suivant() * 6.2832, (g.suivant() + g.suivant() + g.suivant()) / 3.0);
            (a1.cos() * a2 * 0.8, a1.sin() * a2 * 0.8, g.entre(0.0, 1.0))
        };
        // Sizes follow a power law: many pebbles, few boulders.
        let taille = 0.006 + 0.04 * rr.powi(if ceinture { 4 } else { 3 });
        roches.push((cx, cy, taille, g.suivant(), g.suivant()));
    }
    roches.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    for (cx, cy, t, h1, h2) in roches {
        let (px, py) = (c.demi + cx * c.demi, c.demi + cy * c.demi);
        let r = (t * c.demi).max(0.75);
        let ext = (r * 1.5).ceil() as i32 + 1;
        let col0 = teinte(h1);
        let phase = h2 * 6.28;
        for y in (py as i32 - ext).max(0)..=(py as i32 + ext).min(n as i32 - 1) {
            for x in (px as i32 - ext).max(0)..=(px as i32 + ext).min(n as i32 - 1) {
                let (dx, dy) = (x as f32 + 0.5 - px, y as f32 + 0.5 - py);
                let th = dy.atan2(dx);
                let forme = 1.0 + 0.22 * (3.0 * th + phase).sin() + 0.12 * (5.0 * th + phase * 2.0).sin();
                let d = (dx * dx + dy * dy).sqrt() / forme;
                let cov = borne(r - d + 0.5, 0.0, 1.0);
                if cov <= 0.0 {
                    continue;
                }
                let (nx, ny) = (dx / (r * forme), dy / (r * forme));
                let nz = (1.0 - nx * nx - ny * ny).max(0.0).sqrt();
                let dif = lisse(-0.15, 0.5, nx * l[0] + ny * l[1] + nz * l[2]);
                let tex = if r > 3.0 { 0.75 + 0.5 * br.valeur([x as f32 * 0.4, y as f32 * 0.4, h1 * 9.0]) } else { 1.0 };
                let k = (0.12 + 0.95 * dif) * tex * (0.8 + 0.2 * nz);
                let col = mul(col0, k);
                let cov = cov * cadre(px - c.demi, py - c.demi, c.demi);
                let b = &mut sortie[y as usize * n + x as usize];
                *b = dessus([col[0] * cov, col[1] * cov, col[2] * cov, cov], *b);
            }
        }
    }
    let _ = cote;
    sortie
}

/// An anomaly: a dark core ringed by a bright photon ring, spiral arms of light that bend around it, a lens halo.
pub fn anomalie(c: &Ctx) -> Vec<Px> {
    let n = c.cote;
    let bras = borne(c.f("bras", 3.0), 1.0, 8.0).round();
    let torsion = borne(c.f("torsion", 0.8), 0.0, 3.0);
    let halo = borne(c.f("halo", 0.7), 0.0, 2.0);
    let (c0, c1, c2) = (c.pal_i(0), c.pal_i(1), c.pal_i(2));
    let br = c.bruit;
    let oct = if c.cote <= 64 { 3 } else { 4 };
    let phase = alea(c.graine) * 6.28;
    let mut sortie = vec![[0.0f32; 4]; n * n];
    for y in 0..n {
        for x in 0..n {
            let (dx, dy) = (x as f32 + 0.5 - c.demi, y as f32 + 0.5 - c.demi);
            let (u, v) = (dx / c.demi, dy / c.demi);
            let r = (u * u + v * v).sqrt().max(1e-4);
            let th = v.atan2(u);
            let m = cadre(dx, dy, c.demi) * (1.0 - lisse(0.8, 1.0, r));
            // Three samples of the arms at slightly different phases give the chromatic fringe.
            let bras_a = |dec: f32| -> f32 {
                let tors = torsion * 3.0 * (r + 0.12).ln();
                let ph = bras * (th + dec) + tors * bras * 0.5 + phase;
                let w = br.fbm([r * 3.0, (th + dec).cos() * 1.4, (th + dec).sin() * 1.4], oct);
                let arme = 0.5 + 0.5 * (ph + (w - 0.5) * 2.4).cos();
                lisse(0.35, 1.0, arme).powf(1.4)
            };
            let (ar, ag, ab) = (bras_a(0.05), bras_a(0.0), bras_a(-0.05));
            let chute = (-(r - 0.12).max(0.0) * 3.4).exp() * lisse(0.1, 0.2, r);
            let mut px: Px = [0.0; 4];
            let col = [
                (c0[0] * ar * 1.2 + c2[0] * ar * ag * 0.7) * chute,
                (c1[1] * ag * 1.1 + c0[1] * ag * 0.3) * chute,
                (c1[2] * ab + c2[2] * ar * 0.5 + c0[2] * ab * 0.4) * chute,
            ];
            let a = borne(col[0].max(col[1]).max(col[2]), 0.0, 1.0);
            px = dessus([col[0], col[1], col[2], a], px);
            // Lens halo.
            px = dessus(px, lueur(melange(c0, c1, 0.5), halo * (-(r * 3.4)).exp() * 0.5));
            // Photon ring and the black core.
            let anneau = (-((r - 0.125) / 0.013).powi(2)).exp();
            px = dessus(lueur(melange(c1, [1.0, 1.0, 1.0], 0.55), anneau * 1.5 * (0.7 + 0.3 * (th * 2.0 + phase).sin())), px);
            let noyau = borne((0.115 - r) * c.demi + 0.5, 0.0, 1.0);
            px = dessus([0.0, 0.0, 0.0, noyau], px);
            sortie[y * n + x] = [px[0] * m, px[1] * m, px[2] * m, px[3] * m];
        }
    }
    sortie
}
