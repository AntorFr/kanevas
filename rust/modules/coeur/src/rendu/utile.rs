//! Small tools of the renderer: hashing, noise on the sphere, colours (AD-carte-1).
//! Everything here is a pure function of its arguments: no file, no clock, no global state.

pub type V3 = [f32; 3];
/// A premultiplied linear pixel: `[r, g, b, a]`.
pub type Px = [f32; 4];

pub fn hache(mut h: u32) -> u32 {
    h ^= h >> 16;
    h = h.wrapping_mul(0x7feb_352d);
    h ^= h >> 15;
    h = h.wrapping_mul(0x846c_a68b);
    h ^ (h >> 16)
}

/// A real in `[0, 1)` from a hash.
pub fn alea(h: u32) -> f32 {
    (h >> 8) as f32 / 16_777_216.0
}

pub fn borne(v: f32, a: f32, b: f32) -> f32 {
    v.max(a).min(b)
}
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
pub fn lisse(a: f32, b: f32, x: f32) -> f32 {
    let t = borne((x - a) / (b - a), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
pub fn melange(a: V3, b: V3, t: f32) -> V3 {
    [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}
pub fn mul(a: V3, k: f32) -> V3 {
    [a[0] * k, a[1] * k, a[2] * k]
}
pub fn ajoute(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
pub fn produit(a: V3, b: V3) -> V3 {
    [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
}
pub fn norme(v: V3) -> V3 {
    let n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt().max(1e-6);
    [v[0] / n, v[1] / n, v[2] / n]
}
pub fn scal(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// `#rgb` or `#rrggbb` into linear light (gamma 2 approximation, exact inverse at output).
pub fn hex(s: &str) -> Option<V3> {
    let t = s.strip_prefix('#')?;
    let v: Vec<u32> = t.chars().map(|c| c.to_digit(16)).collect::<Option<Vec<_>>>()?;
    let (r, g, b) = match v.len() {
        3 => (v[0] * 17, v[1] * 17, v[2] * 17),
        6 => (v[0] * 16 + v[1], v[2] * 16 + v[3], v[4] * 16 + v[5]),
        _ => return None,
    };
    let c = |x: u32| {
        let f = x as f32 / 255.0;
        f * f
    };
    Some([c(r), c(g), c(b)])
}

/// Piecewise linear ramp through a palette, `t` in `[0, 1]`.
pub fn rampe(pal: &[V3], t: f32) -> V3 {
    if pal.len() == 1 {
        return pal[0];
    }
    let x = borne(t, 0.0, 1.0) * (pal.len() - 1) as f32;
    let i = (x.floor() as usize).min(pal.len() - 2);
    melange(pal[i], pal[i + 1], x - i as f32)
}

/// `a` over `b`, both premultiplied.
pub fn dessus(a: Px, b: Px) -> Px {
    let k = 1.0 - a[3];
    [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k, a[3] + b[3] * k]
}

/// A glow of colour `c` and intensity `i` as a premultiplied pixel (alpha follows the brightest channel, clamped).
pub fn lueur(c: V3, i: f32) -> Px {
    let (r, g, b) = (c[0] * i, c[1] * i, c[2] * i);
    [r, g, b, borne(r.max(g).max(b), 0.0, 1.0)]
}

/// Value noise on a lattice of hashed corners, seeded.
#[derive(Clone, Copy)]
pub struct Bruit {
    pub g: u32,
}

impl Bruit {
    fn pt(&self, x: i32, y: i32, z: i32) -> f32 {
        alea(hache(
            self.g
                ^ hache(
                    (x as u32).wrapping_mul(0x9E37_79B1)
                        ^ hache((y as u32).wrapping_mul(0x85EB_CA77) ^ hache((z as u32).wrapping_mul(0xC2B2_AE3D))),
                ),
        ))
    }

    pub fn valeur(&self, p: V3) -> f32 {
        let (fx, fy, fz) = (p[0].floor(), p[1].floor(), p[2].floor());
        let (x, y, z) = (fx as i32, fy as i32, fz as i32);
        let s = |t: f32| t * t * (3.0 - 2.0 * t);
        let (tx, ty, tz) = (s(p[0] - fx), s(p[1] - fy), s(p[2] - fz));
        let c = |dx, dy, dz| self.pt(x + dx, y + dy, z + dz);
        let x00 = lerp(c(0, 0, 0), c(1, 0, 0), tx);
        let x10 = lerp(c(0, 1, 0), c(1, 1, 0), tx);
        let x01 = lerp(c(0, 0, 1), c(1, 0, 1), tx);
        let x11 = lerp(c(0, 1, 1), c(1, 1, 1), tx);
        lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz)
    }

    /// Fractal sum, normalised to `[0, 1]`.
    pub fn fbm(&self, mut p: V3, oct: u32) -> f32 {
        let (mut a, mut s, mut n) = (0.5, 0.0, 0.0);
        for _ in 0..oct {
            s += a * self.valeur(p);
            n += a;
            p = [p[0] * 2.03 + 1.7, p[1] * 2.03 + 9.2, p[2] * 2.03 + 3.1];
            a *= 0.5;
        }
        s / n
    }

    /// Ridged fractal: bright thin crests, in `[0, 1]`.
    pub fn crete(&self, mut p: V3, oct: u32) -> f32 {
        let (mut a, mut s, mut n) = (0.5, 0.0, 0.0);
        for _ in 0..oct {
            let v = 1.0 - (2.0 * self.valeur(p) - 1.0).abs();
            s += a * v * v;
            n += a;
            p = [p[0] * 2.07 + 4.3, p[1] * 2.07 + 0.7, p[2] * 2.07 + 8.9];
            a *= 0.5;
        }
        s / n
    }

    /// Cellular noise: distance to the nearest and second nearest feature point, and the hash of the nearest cell.
    pub fn cellules(&self, p: V3) -> (f32, f32, u32) {
        let (fx, fy, fz) = (p[0].floor(), p[1].floor(), p[2].floor());
        let (x, y, z) = (fx as i32, fy as i32, fz as i32);
        let (mut f1, mut f2, mut id) = (9.0f32, 9.0f32, 0u32);
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let h = hache(self.g ^ hache((x + dx) as u32 ^ hache((y + dy) as u32 ^ hache((z + dz) as u32))));
                    let q = [
                        (x + dx) as f32 + alea(h),
                        (y + dy) as f32 + alea(hache(h ^ 0x68bc_21eb)),
                        (z + dz) as f32 + alea(hache(h ^ 0x02e5_be93)),
                    ];
                    let d = ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2) + (q[2] - p[2]).powi(2)).sqrt();
                    if d < f1 {
                        f2 = f1;
                        f1 = d;
                        id = h;
                    } else if d < f2 {
                        f2 = d;
                    }
                }
            }
        }
        (f1, f2, id)
    }
}

/// A small sequential generator of its own (mulberry32 flavour), seeded by a hash.
pub struct Flux(pub u32);
impl Flux {
    pub fn suivant(&mut self) -> f32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        alea(hache(self.0))
    }
    pub fn entre(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.suivant()
    }
}
