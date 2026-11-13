# Earth textures (Live page, Earth view)
NASA eoimages.gsfc.nasa.gov could not be reached from the build machine on 13 Nov 2026 (connection timed out), so the NASA-derived maps shipped in the three-globe example images were used, as the spec allows. three-globe is MIT (c) 2019 Vasco Asturiano; the images are derived from NASA Visible Earth products (public domain). Credit shown in the app: "NASA Visible Earth / Blue Marble, Black Marble".
Source folder: https://unpkg.com/three-globe@2.31.0/example/img/ (downloaded 13 Nov 2026, one file at a time, not resized).

| File | Original name | Size | Pixels | What it is |
|---|---|---|---|---|
| day.jpg | earth-blue-marble.jpg | 1.46 MB | 4096x2048 | Blue Marble (NASA Visible Earth), day colour |
| night.jpg | earth-night.jpg | 0.72 MB | 4096x2048 | Earth at night, city lights (NASA Visible Earth, Black Marble family) |
| bump.png | earth-topology.png | 0.38 MB | 2048x1024 | Elevation (grey = height), used for relief |
| water.png | earth-water.png | 0.43 MB | 1600x800 | Water mask (white = ocean), used for sun glint |
Total about 3.0 MB. Stars in the scene are decorative and not data.
