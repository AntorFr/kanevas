//! PNG helpers (AD-battlemap-editeur-7, AD-158): is there real transparency, remove a plain background.
use std::collections::VecDeque;
use std::io::Cursor;

const TOLERANCE: i32 = 24;

struct Image {
    largeur: u32,
    hauteur: u32,
    rgba: Vec<u8>,
}

fn decoder(octets: &[u8]) -> Result<Image, String> {
    let mut d = png::Decoder::new(Cursor::new(octets));
    d.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut lecteur = d.read_info().map_err(|_| "png_illisible".to_string())?;
    let taille = lecteur.output_buffer_size();
    let mut tampon = vec![0u8; taille];
    let info = lecteur.next_frame(&mut tampon).map_err(|_| "png_illisible".to_string())?;
    let brut = &tampon[..info.buffer_size()];
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => brut.to_vec(),
        png::ColorType::Rgb => brut.chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => brut.chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => brut.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return Err("png_illisible".into()),
    };
    Ok(Image { largeur: info.width, hauteur: info.height, rgba })
}

fn encoder(img: &Image) -> Result<Vec<u8>, String> {
    let mut sortie = vec![];
    {
        let mut e = png::Encoder::new(&mut sortie, img.largeur, img.hauteur);
        e.set_color(png::ColorType::Rgba);
        e.set_depth(png::BitDepth::Eight);
        let mut w = e.write_header().map_err(|_| "png_illisible".to_string())?;
        w.write_image_data(&img.rgba).map_err(|_| "png_illisible".to_string())?;
    }
    Ok(sortie)
}

/// True when the PNG carries an alpha channel (or a tRNS chunk) **and** at least one pixel is not opaque.
/// Anything that is not a readable PNG is false.
pub fn alpha_png(octets: &[u8]) -> bool {
    decoder(octets).map(|i| i.rgba.chunks_exact(4).any(|p| p[3] < 255)).unwrap_or(false)
}

/// Makes transparent the plain background connected to the image edge (flood fill from the edge pixels
/// close to the corner colour, 4-connected, per-channel tolerance). The interior is left alone, even
/// where it has the same colour. When the four corners do not agree there is no plain background:
/// the picture is returned unchanged (re-encoded RGBA).
pub fn detourer_fond_uni(octets: &[u8]) -> Result<Vec<u8>, String> {
    let mut img = decoder(octets)?;
    let (l, h) = (img.largeur as usize, img.hauteur as usize);
    let px = |img: &Image, x: usize, y: usize| -> [i32; 4] {
        let i = (y * l + x) * 4;
        [img.rgba[i] as i32, img.rgba[i + 1] as i32, img.rgba[i + 2] as i32, img.rgba[i + 3] as i32]
    };
    let proche = |a: [i32; 4], b: [i32; 4]| (0..3).all(|k| (a[k] - b[k]).abs() <= TOLERANCE);
    let fond = px(&img, 0, 0);

    let coins = [px(&img, l - 1, 0), px(&img, 0, h - 1), px(&img, l - 1, h - 1)];
    if fond[3] == 0 || !coins.iter().all(|c| proche(fond, *c)) {
        return encoder(&img);
    }
    let mut vu = vec![false; l * h];
    let mut file = VecDeque::new();
    for x in 0..l {
        file.push_back((x, 0));
        file.push_back((x, h - 1));
    }
    for y in 0..h {
        file.push_back((0, y));
        file.push_back((l - 1, y));
    }
    while let Some((x, y)) = file.pop_front() {
        if vu[y * l + x] || !proche(fond, px(&img, x, y)) {
            continue;
        }
        vu[y * l + x] = true;
        img.rgba[(y * l + x) * 4 + 3] = 0;
        if x > 0 { file.push_back((x - 1, y)); }
        if y > 0 { file.push_back((x, y - 1)); }
        if x + 1 < l { file.push_back((x + 1, y)); }
        if y + 1 < h { file.push_back((x, y + 1)); }
    }
    encoder(&img)
}
