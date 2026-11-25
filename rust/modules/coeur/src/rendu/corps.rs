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
    /// Cover of the cloud layer under the pixel, in [0, 1] (the lightning flashes only in it).
    nuage: f32,
}

/// The arid tone of a dry land (`terre_seche`), a pale ochre.
const ARIDE: &str = "#c9a272";
/// The lightning of a storm: a warm white.
const ECLAIR: V3 = [1.0, 0.95, 0.8];

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
    // `inclinaison` (degrees) turns the axis further: caps and bands follow it. Zero adds nothing.
    let tilt = tilt + c.f("inclinaison", 0.0).to_radians();
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
    // `atmosphere_epaisseur`: 0.5 is today's width, the halo scales with it (never to a zero width).
    let epaisseur = (c.f("atmosphere_epaisseur", 0.5) / 0.5).max(0.05);
    let halo_larg = 0.28 * halo.min(1.0).max(0.2) * epaisseur;
    let oct = if c.cote <= 24 { 3 } else if c.cote <= 64 { 4 } else if c.cote <= 256 { 5 } else { 6 };
    let mer = c.f("mer", 0.5);
    let nuages = borne(c.f("nuages", 0.0), 0.0, 1.0);
    let calottes = c.f("calottes", 0.0);
    let bandes = c.f("bandes", 0.8);
    let tempete = c.f("tempete", 0.0);
    let cratere = c.f("cratere", 0.0);
    let fissures = c.f("fissures", 0.0);
    let turbulence = borne(c.f("turbulence", 1.0), 0.0, 2.0);
    // Keys of the slice: each neutral value draws the picture of a body without the key.
    let couleur_nuages = c.asp.get("couleur_nuages").and_then(serde_json::Value::as_str).and_then(hex);
    let opacite_nuages = borne(c.f("opacite_nuages", 1.0), 0.0, 1.0);
    let terre_seche = borne(c.f("terre_seche", 0.0), 0.0, 1.0);
    let etirement = borne(c.f("etirement", 1.0), 0.25, 4.0);
    let etire = 1.0 / etirement;
    let eclairs = borne(c.f("eclairs", 0.0), 0.0, 1.0);
    let mers = c.f("mers", 1.0).round().max(1.0);
    let canyons = borne(c.f("canyons", 0.0), 0.0, 1.0);
    let lave_k = borne(c.f("lave", 0.0), 0.0, 1.0);
    let cristaux = borne(c.f("cristaux", 0.0), 0.0, 1.0);
    let geysers = borne(c.f("geysers", 0.0), 0.0, 1.0);
    let cratere_glace = borne(c.f("cratere_glace", 0.0), 0.0, 1.0);
    let couleur_fissures = c.asp.get("couleur_fissures").and_then(serde_json::Value::as_str).and_then(hex);
    // The lights of the night side (AD-nuit-1): neutral at `villes` 0 and `lueur` 0, whatever `force_lueur`.
    let villes = borne(c.f("villes", 0.0), 0.0, 1.0);
    let lueur_k = borne(c.f("lueur", 0.0), 0.0, 1.0);
    let force_lueur = borne(c.f("force_lueur", 1.0), 0.0, 2.0);
    let lumieres = matches!(kind, Kind::Tellurique | Kind::Verrouillee) && force_lueur > 0.0 && (villes > 0.0 || lueur_k > 0.0);
    // Sea level of a telluric world (a locked one has no sea: all of it is land).
    let niveau_mer = if kind == Kind::Tellurique { (0.3 + 0.4 * mer) * lisse(0.0, 0.05, mer) } else { f32::NEG_INFINITY };
    let aride = hex(ARIDE).unwrap_or([0.6; 3]);
    // A locked world draws no clouds unless the aspect asks for a look of them.
    let nuages_verrouillee = nuages > 0.0 && (couleur_nuages.is_some() || opacite_nuages < 1.0 || etirement != 1.0);
    let crateres_nombre = c.asp.get("crateres_nombre").and_then(serde_json::Value::as_f64).map(|n| n as f32);
    let tache = c.asp.get("tache").and_then(serde_json::Value::as_object);
    let brume = c.asp.get("brume").and_then(serde_json::Value::as_str).and_then(hex);
    let br = c.bruit;
    let nuit_def = [0.55, 0.65, 1.0];

    // Several seas: low walls along the borders of large cells split the water into basins.
    let mur_de = |p: V3| -> f32 {
        let f = 0.75 + 0.55 * mers.sqrt();
        let (f1, f2, _) = br.cellules([p[0] * f + 31.0, p[1] * f, p[2] * f]);
        1.0 - lisse(0.0, 0.16, f2 - f1)
    };
    // The land sinks by an offset found on a grid of the visible disc so the walls take no water share
    // (the same sea level as with one sea, whatever the seed): bisection on the share below the level.
    let decalage = if kind == Kind::Tellurique && mers > 1.0 {
        let niveau = (0.3 + 0.4 * mer) * lisse(0.0, 0.05, mer);
        let mut pts: Vec<(f32, f32)> = Vec::new();
        let g = 36;
        for j in 0..g {
            for i in 0..g {
                let (nx, ny) = ((i as f32 + 0.5) / g as f32 * 2.0 - 1.0, (j as f32 + 0.5) / g as f32 * 2.0 - 1.0);
                if nx * nx + ny * ny >= 1.0 {
                    continue;
                }
                let nz = (1.0 - nx * nx - ny * ny).sqrt();
                let p = tourner([nx, ny, nz]);
                pts.push((br.fbm([p[0] * 2.2, p[1] * 2.2, p[2] * 2.2], oct), mur_de(p)));
            }
        }
        let cible = pts.iter().filter(|(h, _)| *h < niveau).count();
        let (mut lo, mut hi) = (-0.6f32, 0.6f32);
        for _ in 0..16 {
            let mid = 0.5 * (lo + hi);
            let n = pts.iter().filter(|(h, m)| *h + 0.3 * m + mid < niveau).count();
            // more water than the target: raise the land (a larger offset)
            if n > cible { lo = mid } else { hi = mid }
        }
        0.5 * (lo + hi)
    } else {
        0.0
    };

    // Craters of an ice world: one layer whose cell frequency makes about `crateres_nombre` (60 by default) of them.
    let creux_glace = |p: V3| -> f32 {
        let n = crateres_nombre.unwrap_or(60.0);
        let f = (n / 10.0).sqrt().max(0.5);
        let (f1, _, id) = br.cellules([p[0] * f + 17.0, p[1] * f - 9.0, p[2] * f]);
        let rayon = 0.2 + 0.25 * alea(id);
        lisse(rayon, rayon * 0.7, f1)
    };

    // The height field: continents, craters, crests, ridges. Cheap, called twice per pixel for the relief.
    let hauteur = |p: V3| -> f32 {
        match kind {
            Kind::Tellurique | Kind::Verrouillee => {
                let h = br.fbm([p[0] * 2.2, p[1] * 2.2, p[2] * 2.2], oct);
                if kind == Kind::Tellurique && mers > 1.0 {
                    h + 0.3 * mur_de(p) + decalage
                } else {
                    h
                }
            }
            Kind::Glace => {
                let h = 0.5 * br.fbm([p[0] * 3.0, p[1] * 3.0, p[2] * 3.0], oct) + 0.5 * br.crete([p[0] * 2.0, p[1] * 2.0, p[2] * 2.0], oct.min(4));
                if cratere_glace > 0.0 { h - 0.35 * cratere_glace * creux_glace(p) } else { h }
            }
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

    // The cloud cover at a point: streaks stretched along the parallels by `etirement` (1 = the base shape).
    let couverture = |p: V3| -> f32 {
        let w = br.fbm([p[0] * 5.0 * etire - 3.0, p[1] * 8.0, p[2] * 5.0 * etire + 1.0], 3);
        // The streaks are bent by the turbulence (1 = the base shape).
        let tord = (turbulence - 1.0) * (w - 0.5) * 1.2;
        let q = br.fbm([p[0] * 2.6 * etire + 11.0 + tord, p[1] * 4.2, p[2] * 2.6 * etire - tord], oct);
        // A wide curve: at 1 the veil covers the disc.
        lisse(0.62 - 0.5 * nuages, 0.8 - 0.5 * nuages, q * 0.8 + w * 0.2)
    };

    // Narrow dark lines (canyons): ridged noise thresholded high, so they stay thin and aligned.
    let ligne_canyon = |p: V3| -> f32 { lisse(0.8, 0.92, br.crete([p[0] * 2.4 - 7.0, p[1] * 2.4, p[2] * 2.4 + 3.0], 4)) };
    // Clear crystals: isolated points, a fraction of the cells of a fine grid.
    let cristal = |p: V3| -> f32 {
        let (f1, _, id) = br.cellules([p[0] * 10.0 + 3.0, p[1] * 10.0, p[2] * 10.0 - 8.0]);
        if alea(hache(id ^ 0xc415)) < cristaux * 0.5 { lisse(0.2, 0.05, f1) } else { 0.0 }
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
                    // Dry land: the arid tone takes over where a slow noise passes a threshold that falls with the key.
                    if terre_seche > 0.0 {
                        let sec = br.fbm([p[0] * 1.7 - 6.0, p[1] * 1.7 + 2.0, p[2] * 1.7], 3);
                        let seuil = lerp(0.85, -0.1, terre_seche);
                        alb = melange(alb, aride, lisse(seuil, seuil + 0.1, sec) * 0.9);
                    }
                    if canyons > 0.0 {
                        alb = melange(alb, mul(alb, 0.3), ligne_canyon(p) * canyons);
                    }
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
                let mut nuage = 0.0;
                if nuages > 0.0 {
                    let dens = couverture(p);
                    alb = melange(alb, couleur_nuages.unwrap_or([0.96, 0.97, 1.0]), dens * 0.92 * opacite_nuages);
                    spec *= 1.0 - dens * opacite_nuages;
                    nuage = dens;
                }
                // Lights of the night side stay out: a quiet blue-black.
                Surf { alb, emis: [0.0; 3], spec, nuit: nuit_def, nuage }
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
                // Dry ground: the arid tone spread over the surface (no sea on a locked world).
                if terre_seche > 0.0 {
                    alb = melange(alb, aride, terre_seche * 0.7);
                }
                let mut nuage = 0.0;
                if nuages_verrouillee {
                    let dens = couverture(p);
                    alb = melange(alb, couleur_nuages.unwrap_or([0.96, 0.97, 1.0]), dens * 0.92 * opacite_nuages);
                    nuage = dens;
                }
                Surf { alb, emis: mul(c.pal_i(pal.len() - 1), 0.05 * lisse(0.75, 1.0, k)), spec: 0.0, nuit: [0.75, 0.85, 1.0], nuage }
            }
            Kind::Glace => {
                let m = borne(h * 1.2, 0.0, 1.0);
                let mut alb = rampe(pal, 1.0 - m);
                let crev = br.crete([p[0] * 3.5 + 2.0, p[1] * 3.5, p[2] * 3.5], 4);
                let lignes = lisse(0.72, 0.9, crev) * fissures;
                alb = melange(alb, couleur_fissures.unwrap_or_else(|| mul(c.pal_i(pal.len() - 1), 0.55)), lignes);
                // Frost: lighter where the surface is high.
                alb = melange(alb, c.pal_i(0), lisse(0.55, 0.9, h) * 0.5);
                if cratere_glace > 0.0 {
                    alb = melange(alb, mul(alb, 0.45), creux_glace(p) * cratere_glace);
                }
                if cristaux > 0.0 {
                    alb = melange(alb, [0.97, 0.99, 1.0], cristal(p));
                }
                Surf { alb, emis: [0.0; 3], spec: 0.55, nuit: [0.6, 0.7, 1.0], nuage: 0.0 }
            }
            Kind::Rocheux => {
                let m = borne(h * 1.3 + 0.35, 0.0, 1.0);
                let mut alb = rampe(pal, m);
                let tache = br.fbm([p[0] * 1.5 + 8.0, p[1] * 1.5, p[2] * 1.5], 3);
                alb = mul(alb, 0.75 + 0.5 * tache);
                let mut emis = [0.0; 3];
                if canyons > 0.0 {
                    alb = melange(alb, mul(alb, 0.3), ligne_canyon(p) * canyons);
                }
                // Coloured cracks: only when a colour is given, as strong as `fissures` or 0.6.
                if let Some(col) = couleur_fissures {
                    let crev = br.crete([p[0] * 3.5 + 2.0, p[1] * 3.5, p[2] * 3.5], 4);
                    let force = if fissures > 0.0 { fissures } else { 0.6 };
                    alb = melange(alb, col, lisse(0.72, 0.9, crev) * force);
                }
                // Lava: glowing veins in the low relief only.
                if lave_k > 0.0 {
                    let crev = br.crete([p[0] * 2.4 + 4.0, p[1] * 2.4, p[2] * 2.4], 4);
                    let bas = lisse(0.2, 0.1, h);
                    let veine = lisse(0.45, 0.7, crev) * bas * lave_k;
                    alb = melange(alb, [1.0, 0.45, 0.1], veine);
                    emis = mul([1.0, 0.45, 0.1], 1.3 * veine);
                }
                if cristaux > 0.0 {
                    alb = melange(alb, [0.97, 0.99, 1.0], cristal(p));
                }
                Surf { alb, emis, spec: 0.0, nuit: [0.7, 0.75, 1.0], nuage: 0.0 }
            }
            Kind::Lave => {
                // A dark crust broken by glowing cracks.
                let crev = br.crete([p[0] * 2.4 + 4.0, p[1] * 2.4, p[2] * 2.4], oct.min(5));
                let fond = br.fbm([p[0] * 5.0, p[1] * 5.0, p[2] * 5.0], 3);
                let braise = lisse(0.5, 0.82, crev);
                let croute = melange(c.pal_i(0), c.pal_i(1), fond);
                let chaud = melange(c.pal_i(2), c.pal_i(3), lisse(0.78, 1.0, crev));
                let chaud = couleur_fissures.unwrap_or(chaud);
                let alb = melange(croute, chaud, braise);
                Surf { alb: melange(alb, croute, 0.5 * (1.0 - braise)), emis: mul(chaud, 1.6 * braise * (0.65 + 0.35 * fond)), spec: 0.0, nuit: [1.0, 0.9, 0.9], nuage: 0.0 }
            }
            Kind::Gazeuse => {
                // Bands of latitude warped by turbulence, a storm, limb darkening comes with the lighting.
                let lat = p[1];
                let tur = br.fbm([p[0] * 2.0 * etire, p[1] * 6.0, p[2] * 2.0 * etire], oct);
                let tur2 = br.fbm([p[0] * 5.0 * etire + 7.0, p[1] * 14.0, p[2] * 5.0 * etire], oct.min(4));
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
                Surf { alb, emis: [0.0; 3], spec: 0.0, nuit: [0.6, 0.55, 0.7], nuage: 1.0 }
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
                // Lights of the night side: an emission weighted by the night amount, nothing on a lit pixel.
                let nuit_lum = 1.0 - eclair;
                if lumieres && nuit_lum > 0.0 {
                    let mut lum = [0.0f32; 3];
                    if villes > 0.0 {
                        // Hot points on the land, as many and as bright as `villes`; the places come from the seed's noise.
                        let terre = lisse(niveau_mer, niveau_mer + 0.02, h);
                        if terre > 0.0 {
                            let (f1, _, id) = br.cellules([p[0] * 16.0 - 13.0, p[1] * 16.0 + 7.0, p[2] * 16.0 + 4.0]);
                            if alea(hache(id ^ 0xc171)) < villes * 0.5 {
                                lum = ajoute(lum, mul([1.0, 0.78, 0.35], 0.9 * villes * lisse(0.18, 0.02, f1) * terre));
                            }
                        }
                    }
                    if lueur_k > 0.0 {
                        // A cold veil on land and shallows (never the deep sea), in veins that follow the relief.
                        let bas = lisse(niveau_mer - 0.25, niveau_mer - 0.15, h);
                        if bas > 0.0 {
                            let crete = br.crete([p[0] * 2.8 + 9.0, p[1] * 2.8 - 5.0, p[2] * 2.8 + 2.0], 4);
                            let seuil = lerp(0.9, 0.5, lueur_k);
                            let veine = lisse(seuil, seuil + 0.1, crete) * (0.5 + 0.5 * lisse(niveau_mer - 0.1, niveau_mer + 0.4, h));
                            lum = ajoute(lum, mul([0.2, 0.85, 0.75], 0.55 * lueur_k * veine * bas));
                        }
                    }
                    col = ajoute(col, mul(lum, force_lueur * nuit_lum));
                }
                // Lightning: small flashes inside the clouds, on the night side only.
                if eclairs > 0.0 && s.nuage > 0.3 {
                    let nuit = 1.0 - lisse(0.0, 0.15, dif);
                    if nuit > 0.0 {
                        let (f1, _, id) = br.cellules([p[0] * 14.0 + 5.0, p[1] * 14.0 - 2.0, p[2] * 14.0]);
                        if alea(hache(id ^ 0x51ed)) < eclairs * 0.4 {
                            col = ajoute(col, mul(ECLAIR, 1.6 * lisse(0.12, 0.0, f1) * nuit * lisse(0.3, 0.7, s.nuage)));
                        }
                    }
                }
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
            // Geysers: plumes rising off the limb, at places drawn from the seed (the body's own draws do not move).
            if geysers > 0.0 && u > 0.97 && (kind == Kind::Glace || kind == Kind::Rocheux) {
                let nb = 1 + (geysers * 3.0) as u32;
                for i in 0..nb {
                    let ang = alea(hache(c.graine ^ 0x6e75 ^ i.wrapping_mul(0x9e37))) * 6.2832;
                    let (ax, ay) = (ang.cos(), ang.sin());
                    let long = 0.12 + 0.2 * geysers * (0.6 + 0.4 * alea(hache(c.graine ^ 0x1a7 ^ i)));
                    let along = (sx * ax + sy_ * ay) - 1.0;
                    let perp = (sx * ay - sy_ * ax).abs();
                    if along > -0.02 && along < long {
                        let t = (along.max(0.0)) / long;
                        let larg = 0.035 * (1.0 - 0.7 * t);
                        let a = (1.0 - lisse(larg * 0.5, larg, perp)) * (1.0 - t) * 0.9;
                        if a > 0.0 {
                            px = dessus([0.92 * a, 0.96 * a, 1.0 * a, a], px);
                        }
                    }
                }
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
