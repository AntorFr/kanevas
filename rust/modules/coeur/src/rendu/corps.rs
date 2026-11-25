//! Bodies drawn as a lit sphere: tellurique, verrouillée, glace, rocheux, lave, gazeuse (the families of `astres.py`).
//! Lighting with terminator and rim light, atmosphere glow, relief by the slope toward the light, and the
//! shadow of a ring are parameters of the aspect (AD-149).
use super::catalogue::Kind;
use super::utile::*;
use super::Ctx;

struct Surf {
    alb: V3,
    /// Light the surface gives by itself (lava), seen on the night side too.
    emis: V3,
    /// Specular strength (ice, sea).
    spec: f32,
    /// 0 = lit by the terminator normally, 1 = the surface holds no night (clouds are lit, not dark).
    nuit: V3,
}

struct Anneau {
    ri: f32,
    ro: f32,
    sin_i: f32,
    cos_i: f32,
    angle: f32,
    opacite: f32,
    couleur: [V3; 2],
}

pub fn rendre(c: &Ctx, kind: Kind) -> Vec<Px> {
    let n = c.cote;
    let mut graine = Flux(c.graine);
    // Orientation of the body: a yaw and a tilt drawn from the seed (same body at every side).
    let yaw = graine.entre(0.0, 6.2832);
    let tilt = graine.entre(-0.35, 0.35) * if kind == Kind::Gazeuse { 0.5 } else { 1.0 };
    let (sy, cy, st, ct) = (yaw.sin(), yaw.cos(), tilt.sin(), tilt.cos());
    let tourner = |p: V3| -> V3 {
        let (x, z) = (p[0] * cy + p[2] * sy, -p[0] * sy + p[2] * cy);
        [x * ct - p[1] * st, x * st + p[1] * ct, z]
    };

    // The tilt alone, without the yaw, with the north up: the frame of an explicit `tache`.
    let incliner = |n: V3| -> V3 {
        let ys = -n[1];
        [n[0] * ct - ys * st, n[0] * st + ys * ct, n[2]]
    };

    // Light: direction on the screen, elevation toward the viewer.
    let a = c.f("lumiere", 135.0).to_radians();
    let el = borne(c.f("elevation", 0.5), 0.05, 1.2);
    let l = norme([a.cos() * el.cos(), -a.sin() * el.cos(), el.sin()]);
    let lcol = c.col("lumiere_couleur", [1.0, 0.96, 0.9]);
    let ombre = borne(c.f("ombre", 0.05), 0.0, 0.5);
    let tw = borne(c.f("terminateur", 0.12), 0.01, 0.6);
    let bord = borne(c.f("bord", 0.4), 0.0, 2.0);
    let halo = borne(c.f("halo", 0.0), 0.0, 2.0);
    let halo_col = c.col("halo_couleur", [0.5, 0.7, 1.0]);
    let relief = borne(c.f("relief", 0.0), 0.0, 2.0);

    // A gas giant may carry a ring, only when the aspect asks for it.
    let anneau = anneau_de(c, kind, &mut graine);
    let echelle = if anneau.is_some() { c.f("echelle", 0.62).min(0.46) } else { borne(c.f("echelle", 0.78), 0.2, 0.95) };
    let r_corps = c.demi * echelle;
    let halo_larg = 0.28 * halo.min(1.0).max(0.2);
    let oct = if c.cote <= 24 { 3 } else if c.cote <= 64 { 4 } else if c.cote <= 256 { 5 } else { 6 };
    let mer = c.f("mer", 0.5);
    let nuages = borne(c.f("nuages", 0.0), 0.0, 1.0);
    let calottes = c.f("calottes", 0.0);
    let bandes = c.f("bandes", 0.8);
    let tempete = c.f("tempete", 0.0);
    let cratere = c.f("cratere", 0.0);
    let fissures = c.f("fissures", 0.0);
    let turbulence = borne(c.f("turbulence", 1.0), 0.0, 2.0);
    let crateres_nombre = c.asp.get("crateres_nombre").and_then(serde_json::Value::as_f64).map(|n| n as f32);
    let tache = c.asp.get("tache").and_then(serde_json::Value::as_object);
    let brume = c.asp.get("brume").and_then(serde_json::Value::as_str).and_then(hex);
    let br = c.bruit;
    let nuit_def = [0.55, 0.65, 1.0];

    // The height field: continents, craters, crests, ridges. Cheap, called twice per pixel for the relief.
    let hauteur = |p: V3| -> f32 {
        match kind {
            Kind::Tellurique | Kind::Verrouillee => br.fbm([p[0] * 2.2, p[1] * 2.2, p[2] * 2.2], oct),
            Kind::Glace => 0.5 * br.fbm([p[0] * 3.0, p[1] * 3.0, p[2] * 3.0], oct) + 0.5 * br.crete([p[0] * 2.0, p[1] * 2.0, p[2] * 2.0], oct.min(4)),
            Kind::Rocheux => {
                let base = br.fbm([p[0] * 3.0, p[1] * 3.0, p[2] * 3.0], oct);
                // Without `crateres_nombre` two layers whose density follows `cratere`; with it, one layer whose
                // cell frequency makes about that many craters on the sphere (~10 cells per unit of f squared).
                let (f_gros, plein) = match crateres_nombre {
                    None => (5.0, 0.8),
                    Some(n) => ((n / 10.0).sqrt().max(0.5), 1.0),
                };
                let (f1, _, id) = br.cellules([p[0] * f_gros, p[1] * f_gros, p[2] * f_gros]);
                let rayon = 0.2 + 0.25 * alea(id);
                let bol = if alea(hache(id ^ 77)) < plein { lisse(rayon, rayon * 0.7, f1) * 0.9 - lisse(rayon * 1.0, rayon * 1.25, f1) * 0.35 * lisse(rayon * 1.4, rayon, f1) } else { 0.0 };
                let petit = if crateres_nombre.is_some() {
                    0.0
                } else {
                    let (g1, _, gid) = br.cellules([p[0] * 11.0, p[1] * 11.0, p[2] * 11.0]);
                    let r2 = 0.12 + 0.15 * alea(gid);
                    lisse(r2, r2 * 0.65, g1) * 0.5
                };
                if crateres_nombre == Some(0.0) { base * 0.5 } else { base * 0.5 - (bol + petit) * (0.3 + 0.7 * cratere.min(1.0)) }
            }
            Kind::Lave => br.fbm([p[0] * 2.5, p[1] * 2.5, p[2] * 2.5], oct),
            Kind::Gazeuse => 0.5,
        }
    };

    let surface = |p: V3, h: f32, nrm: V3, d: f32| -> Surf {
        let pal = &c.pal;
        match kind {
            Kind::Tellurique => {
                // No sea at all at 0: the level fades to nothing under 0.05.
                let niveau = (0.3 + 0.4 * mer) * lisse(0.0, 0.05, mer);
                let lat = p[1].abs();
                let mut alb;
                let mut spec = 0.0;
                if h < niveau {
                    let prof = lisse(niveau - 0.25, niveau, h);
                    alb = melange(c.pal_i(0), c.pal_i(1), prof);
                    spec = 0.5;
                } else {
                    let t = (h - niveau) / (1.0 - niveau).max(0.05);
                    let sable = lisse(0.0, 0.07, t);
                    let terre = rampe(&pal[2.min(pal.len() - 1)..5.min(pal.len())], lisse(0.05, 0.75, t) * 0.999);
                    let humid = br.fbm([p[0] * 1.3 + 5.0, p[1] * 1.3, p[2] * 1.3], 3);
                    let vert = melange(c.pal_i(3), c.pal_i(4), humid);
                    let sol = melange(c.pal_i(2), melange(vert, terre, lisse(0.6, 1.0, t)), sable);
                    alb = melange(sol, c.pal_i(5), lisse(0.78, 1.0, t) * 0.8);
                }
                // Polar caps, with a ragged edge.
                let lim = 1.0 - 0.28 * calottes - 0.1 * br.fbm([p[0] * 4.0, p[1] * 4.0, p[2] * 4.0], 3);
                if calottes > 0.0 {
                    let g = lisse(lim, lim + 0.04, lat);
                    alb = melange(alb, c.pal_i(6), g);
                    if h < niveau {
                        spec *= 1.0 - g;
                    }
                }
                // Clouds: a bright layer lit like the ground, thicker toward the weather fronts.
                if nuages > 0.0 {
                    let w = br.fbm([p[0] * 5.0 - 3.0, p[1] * 8.0, p[2] * 5.0 + 1.0], 3);
                    // The streaks are bent by the turbulence (1 = the base shape).
                    let tord = (turbulence - 1.0) * (w - 0.5) * 1.2;
                    let q = br.fbm([p[0] * 2.6 + 11.0 + tord, p[1] * 4.2, p[2] * 2.6 - tord], oct);
                    // A wide curve: at 1 the veil covers the disc.
                    let dens = lisse(0.62 - 0.5 * nuages, 0.8 - 0.5 * nuages, q * 0.8 + w * 0.2);
                    alb = melange(alb, [0.96, 0.97, 1.0], dens * 0.92);
                    spec *= 1.0 - dens;
                }
                // Lights of the night side stay out: a quiet blue-black.
                Surf { alb, emis: [0.0; 3], spec, nuit: nuit_def }
            }
            Kind::Verrouillee => {
                // The sub-stellar point is fixed: scorched at the centre of the day side, a living ring near the
                // terminator, ice on the night side. `d` is the angle to the light, not the lit amount.
                let t = borne(d * 0.5 + 0.5, 0.0, 1.0);
                let var = (br.fbm([p[0] * 3.0, p[1] * 3.0, p[2] * 3.0], oct) - 0.5) * 0.5;
                let k = borne(t + var * 0.5, 0.0, 1.0);
                let mut alb = rampe(pal, 1.0 - k);
                let fiss = br.crete([p[0] * 4.0, p[1] * 4.0, p[2] * 4.0], 4);
                alb = mul(alb, 0.8 + 0.4 * fiss * (0.3 + h));
                Surf { alb, emis: mul(c.pal_i(pal.len() - 1), 0.05 * lisse(0.75, 1.0, k)), spec: 0.0, nuit: [0.75, 0.85, 1.0] }
            }
            Kind::Glace => {
                let m = borne(h * 1.2, 0.0, 1.0);
                let mut alb = rampe(pal, 1.0 - m);
                let crev = br.crete([p[0] * 3.5 + 2.0, p[1] * 3.5, p[2] * 3.5], 4);
                let lignes = lisse(0.72, 0.9, crev) * fissures;
                alb = melange(alb, mul(c.pal_i(pal.len() - 1), 0.55), lignes);
                // Frost: lighter where the surface is high.
                alb = melange(alb, c.pal_i(0), lisse(0.55, 0.9, h) * 0.5);
                Surf { alb, emis: [0.0; 3], spec: 0.55, nuit: [0.6, 0.7, 1.0] }
            }
            Kind::Rocheux => {
                let m = borne(h * 1.3 + 0.35, 0.0, 1.0);
                let mut alb = rampe(pal, m);
                let tache = br.fbm([p[0] * 1.5 + 8.0, p[1] * 1.5, p[2] * 1.5], 3);
                alb = mul(alb, 0.75 + 0.5 * tache);
                Surf { alb, emis: [0.0; 3], spec: 0.0, nuit: [0.7, 0.75, 1.0] }
            }
            Kind::Lave => {
                // A dark crust broken by glowing cracks.
                let crev = br.crete([p[0] * 2.4 + 4.0, p[1] * 2.4, p[2] * 2.4], oct.min(5));
                let fond = br.fbm([p[0] * 5.0, p[1] * 5.0, p[2] * 5.0], 3);
                let braise = lisse(0.5, 0.82, crev);
                let croute = melange(c.pal_i(0), c.pal_i(1), fond);
                let chaud = melange(c.pal_i(2), c.pal_i(3), lisse(0.78, 1.0, crev));
                let alb = melange(croute, chaud, braise);
                Surf { alb: melange(alb, croute, 0.5 * (1.0 - braise)), emis: mul(chaud, 1.6 * braise * (0.65 + 0.35 * fond)), spec: 0.0, nuit: [1.0, 0.9, 0.9] }
            }
            Kind::Gazeuse => {
                // Bands of latitude warped by turbulence, a storm, limb darkening comes with the lighting.
                let lat = p[1];
                let tur = br.fbm([p[0] * 2.0, p[1] * 6.0, p[2] * 2.0], oct);
                let tur2 = br.fbm([p[0] * 5.0 + 7.0, p[1] * 14.0, p[2] * 5.0], oct.min(4));
                let w = lat * (5.0 + 3.0 * c.bruit.valeur([3.3, 1.1, 0.5])) + (tur - 0.5) * 1.6 * bandes * turbulence + (tur2 - 0.5) * 0.35 * turbulence;
                let b = 0.5 + 0.5 * (w * 6.2832 * 0.55).sin();
                let b2 = 0.5 + 0.5 * (w * 6.2832 * 1.3 + 1.0).sin();
                let t = borne(b * 0.7 + b2 * 0.3, 0.0, 1.0);
                let mut alb = rampe(pal, t * 0.999);
                alb = mul(alb, 0.82 + 0.3 * tur2);
                if tempete > 0.0 {
                    if let Some(t) = tache {
                        // Placed by the aspect: `latitude` (north up), `taille`, `couleur`, in the body's tilt-only frame.
                        let fl = |k: &str, d: f32| t.get(k).and_then(serde_json::Value::as_f64).map_or(d, |x| x as f32);
                        let lat_t = borne(fl("latitude", -0.3), -1.0, 1.0);
                        let taille = borne(fl("taille", 0.12), 0.02, 0.4);
                        let col_t = t.get("couleur").and_then(serde_json::Value::as_str).and_then(hex).unwrap_or_else(|| c.pal_i(2));
                        let q = incliner(nrm);
                        let h = (1.0 - lat_t * lat_t).max(0.0).sqrt();
                        let cx = h * 0.35f32.sin();
                        let dd = (((q[0] - cx) / (taille * 2.0)).powi(2) + ((q[1] - lat_t) / taille).powi(2)).sqrt();
                        let oeil = lisse(1.0, 0.0, dd + (tur2 - 0.5) * 0.25) * if q[2] > 0.0 { 1.0 } else { 0.0 };
                        alb = melange(alb, col_t, oeil * tempete.min(1.0) * 0.8);
                    } else {
                        // A great storm, an oval at a seeded place in the south.
                        let (cx, cyy, cz) = (0.35, -0.3, 0.88);
                        let dx = (p[0] - cx) * 2.2;
                        let dy = (p[1] - cyy) * 3.6;
                        let dz = p[2] - cz;
                        let dd = (dx * dx + dy * dy + dz * dz * 0.0).sqrt();
                        let oeil = lisse(0.6, 0.0, dd + (tur2 - 0.5) * 0.25);
                        alb = melange(alb, melange(c.pal_i(2), [1.0, 0.92, 0.8], 0.35), oeil * tempete.min(1.0) * 0.8);
                    }
                }
                let _ = (nrm, h);
                Surf { alb, emis: [0.0; 3], spec: 0.0, nuit: [0.6, 0.55, 0.7] }
            }
        }
    };

    let mut sortie = vec![[0.0f32; 4]; n * n];
    for y in 0..n {
        for x in 0..n {
            let dx = x as f32 + 0.5 - c.demi;
            let dy = y as f32 + 0.5 - c.demi;
            let dpx = (dx * dx + dy * dy).sqrt();
            let u = dpx / r_corps;
            let (sx, sy_) = (dx / r_corps, dy / r_corps);
            let mut px: Px = [0.0; 4];

            // Atmosphere glow, behind and around the disc, mostly on the lit side.
            if halo > 0.0 && u > 0.92 && u < 1.0 + halo_larg * 2.5 {
                let dir = if dpx > 1e-3 { [dx / dpx, dy / dpx] } else { [0.0, 0.0] };
                let cote_clair = lisse(-0.6, 0.8, dir[0] * l[0] + dir[1] * l[1]);
                let t = ((u - 1.0).max(0.0)) / halo_larg;
                let g = (1.0 / (1.0 + t * t * 9.0)).powi(2) * halo.min(1.0) * (0.3 + 0.7 * cote_clair);
                let fin = 1.0 - lisse(1.0 + halo_larg * 2.0, 1.0 + halo_larg * 2.5, u);
                px = dessus(px, lueur(halo_col, g * 0.9 * fin));
            }

            // The ring behind the body.
            let mut devant: Option<Px> = None;
            let mut zs = f32::NEG_INFINITY;
            if u < 1.0 {
                zs = (1.0 - u * u).max(0.0).sqrt();
            }
            if let Some(an) = &anneau {
                if let Some((p_an, z_an)) = pixel_anneau(an, sx, sy_, zs, &l, c) {
                    if z_an > zs {
                        devant = Some(p_an);
                    } else {
                        px = dessus(p_an, px);
                    }
                }
            }

            let cov = borne(r_corps - dpx + 0.5, 0.0, 1.0);
            if cov > 0.0 {
                let (nx, ny) = if u > 1.0 { (sx / u, sy_ / u) } else { (sx, sy_) };
                let nz = (1.0 - nx * nx - ny * ny).max(0.0).sqrt();
                let nrm = [nx, ny, nz];
                let p = tourner(nrm);
                let mut dif = scal(nrm, l);
                // Relief: the slope toward the light bends the lit amount.
                let h = hauteur(p);
                if relief > 0.0 {
                    let tl = [l[0] - dif * nx, l[1] - dif * ny, l[2] - dif * nz];
                    let eps = 0.02;
                    let h2 = hauteur(tourner([nx + tl[0] * eps, ny + tl[1] * eps, nz + tl[2] * eps]));
                    let pente = (h2 - h) / eps;
                    dif -= pente * relief * 0.045 * (0.25 + nz);
                }
                // The locked world's colour depends on the angle to the light, not on the lit amount.
                let angle_l = scal(nrm, l);
                let s = surface(p, h, nrm, angle_l);
                let mut eclair = lisse(-tw, tw + 0.2, dif);
                // Shadow of the ring on the body.
                if let Some(an) = &anneau {
                    eclair *= 1.0 - ombre_anneau(an, nx, ny, nz, &l, c);
                }
                let jour = produit(lcol, [1.0, 1.0, 1.0]);
                let mut col = produit(s.alb, ajoute(mul(produit(s.nuit, [0.12, 0.14, 0.2]), ombre * 4.0), mul(jour, eclair * (1.0 - ombre))));
                // Limb darkening for the bands, and a touch of wrap light near the terminator.
                if kind == Kind::Gazeuse {
                    col = mul(col, 0.55 + 0.45 * nz.sqrt());
                }
                let chaleur = lisse(0.0, 0.25, dif) * (1.0 - lisse(0.25, 0.7, dif));
                col = ajoute(col, mul(produit(s.alb, [1.0, 0.55, 0.35]), 0.07 * chaleur * ombre.max(0.2)));
                // Specular (sea, ice).
                if s.spec > 0.0 {
                    let hv = norme([l[0], l[1], l[2] + 1.0]);
                    let sp = scal(nrm, hv).max(0.0).powi(40) * s.spec * eclair;
                    col = ajoute(col, mul(lcol, sp * 0.8));
                }
                col = ajoute(col, s.emis);
                // Rim light and in-scattering of the atmosphere at the limb.
                if bord > 0.0 || halo > 0.0 {
                    let fres = (1.0 - nz).powi(3);
                    let cote_jour = lisse(-0.35, 0.55, dif);
                    let mut rim = mul(halo_col, fres * bord * (0.2 + 0.8 * cote_jour));
                    rim = ajoute(rim, mul(halo_col, (1.0 - nz).powi(2) * halo.min(1.0) * 0.5 * cote_jour));
                    col = ajoute(col, rim);
                }
                // The haze of a world: a veil of the `brume` colour, thicker toward the limb, on the lit side.
                if let Some(b) = brume {
                    let k = (0.25 + 0.75 * (1.0 - nz).powf(1.5)) * 0.4 * lisse(-0.35, 0.55, dif);
                    col = melange(col, b, k);
                }
                let corps: Px = [col[0] * cov, col[1] * cov, col[2] * cov, cov];
                px = dessus(corps, px);
            }
            if let Some(d) = devant {
                px = dessus(d, px);
            }
            sortie[y * n + x] = px;
        }
    }
    sortie
}

fn anneau_de(c: &Ctx, kind: Kind, g: &mut Flux) -> Option<Anneau> {
    let v = c.asp.get("anneau");
    // The former 28 % draw of a ring is made and dropped: the other draws of the seed do not move, and a ring
    // exists only when the aspect asks for it.
    if kind == Kind::Gazeuse && v.is_none() {
        let _ = g.suivant();
    }
    let on = match v {
        Some(serde_json::Value::Bool(b)) => *b,
        Some(serde_json::Value::Object(_)) => true,
        _ => false,
    };
    // Drawn in every case, so the other draws of the seed do not move with the ring.
    let ri = g.entre(1.3, 1.5);
    let lar = g.entre(0.45, 0.8);
    let ang = g.entre(-0.45, 0.1);
    if !on {
        return None;
    }
    let o = v.and_then(|x| x.as_object());
    let fl = |k: &str, d: f32| o.and_then(|m| m.get(k)).and_then(serde_json::Value::as_f64).map_or(d, |x| x as f32);
    let inc = borne(fl("inclinaison", 0.38), 0.12, 1.2);
    let ri = borne(fl("interieur", ri), 1.1, 2.5);
    let ro = borne(fl("exterieur", ri + lar), ri + 0.1, 3.5);
    let colr = |k: &str, d: V3| o.and_then(|m| m.get(k)).and_then(serde_json::Value::as_str).and_then(hex).unwrap_or(d);
    Some(Anneau {
        ri,
        ro,
        sin_i: inc.sin(),
        cos_i: inc.cos(),
        angle: fl("angle", ang),
        opacite: borne(fl("opacite", 0.85), 0.0, 1.0),
        couleur: [colr("couleur", hex("#e2d2b0").unwrap_or([0.7; 3])), colr("couleur2", hex("#9a8466").unwrap_or([0.3; 3]))],
    })
}

fn densite_anneau(an: &Anneau, rho: f32, c: &Ctx) -> f32 {
    if rho <= an.ri || rho >= an.ro {
        return 0.0;
    }
    let t = (rho - an.ri) / (an.ro - an.ri);
    let bandes = 0.35 + 0.65 * c.bruit.valeur([rho * 16.0, 0.5, 0.5]) * (0.6 + 0.4 * c.bruit.valeur([rho * 55.0, 3.5, 1.5]));
    let faille = 1.0 - 0.9 * (-((t - 0.64) / 0.035).powi(2)).exp();
    bandes * faille * lisse(0.0, 0.05, t) * (1.0 - lisse(0.92, 1.0, t))
}

/// The pixel of the ring seen through the screen point `(sx, sy)` (in body radii), with its depth.
fn pixel_anneau(an: &Anneau, sx: f32, sy: f32, zs: f32, l: &V3, c: &Ctx) -> Option<(Px, f32)> {
    let (ca, sa) = (an.angle.cos(), an.angle.sin());
    let (x, y) = (sx * ca + sy * sa, -sx * sa + sy * ca);
    let z = y * an.cos_i / an.sin_i;
    let rho = (x * x + y * y + z * z).sqrt();
    let d = densite_anneau(an, rho, c);
    if d <= 0.0 {
        return None;
    }
    // Light in the ring's frame; the planet's shadow falls on the far side.
    let (lx, ly) = (l[0] * ca + l[1] * sa, -l[0] * sa + l[1] * ca);
    let lz = l[2];
    let pl = x * lx + y * ly + z * lz;
    let perp2 = rho * rho - pl * pl;
    let ombre = if pl < 0.0 && perp2 < 1.0 { 1.0 - lisse(0.82, 1.0, perp2.max(0.0).sqrt()) } else { 0.0 };
    let t = borne((rho - an.ri) / (an.ro - an.ri), 0.0, 1.0);
    let base = melange(an.couleur[0], an.couleur[1], lisse(0.0, 1.0, c.bruit.valeur([rho * 9.0, 2.0, 7.0])) * 0.7 + t * 0.3);
    let _ = zs;
    let lum = 0.12 + 0.88 * (1.0 - ombre);
    let a = borne(d * an.opacite, 0.0, 1.0);
    let col = mul(base, lum);
    Some(([col[0] * a, col[1] * a, col[2] * a, a], z))
}

/// How much of the light the ring takes from a point of the body (0 = none).
fn ombre_anneau(an: &Anneau, nx: f32, ny: f32, nz: f32, l: &V3, c: &Ctx) -> f32 {
    let (ca, sa) = (an.angle.cos(), an.angle.sin());
    let (x, y) = (nx * ca + ny * sa, -nx * sa + ny * ca);
    let (lx, ly) = (l[0] * ca + l[1] * sa, -l[0] * sa + l[1] * ca);
    // Plane: y * cos_i - z * sin_i = 0.
    let nl = ly * an.cos_i - l[2] * an.sin_i;
    if nl.abs() < 1e-4 {
        return 0.0;
    }
    let t = -(y * an.cos_i - nz * an.sin_i) / nl;
    if t <= 0.0 {
        return 0.0;
    }
    let (qx, qy, qz) = (x + t * lx, y + t * ly, nz + t * l[2]);
    let rho = (qx * qx + qy * qy + qz * qz).sqrt();
    densite_anneau(an, rho, c) * an.opacite * 0.85
}
