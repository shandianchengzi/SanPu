# Third-party encoder attribution

SanPu is licensed under GPL-3.0-only. MP3 export additionally uses
[@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs)
version 1.2.7, authored by contributors to lamejs and LAME, under LGPL-3.0.

- Source: https://github.com/shijinyu/lamejs (package's corresponding source revision)
- LAME: https://lame.sourceforge.io/
- LGPL-3.0 license: https://www.gnu.org/licenses/lgpl-3.0.html
- GPL-3.0 license: https://www.gnu.org/licenses/gpl-3.0.html

The library is **not combined** into the application source bundle. The
distribution copies its published ES module byte-for-byte to
`vendor/lamejs.js`, and copies its original LICENSE to
`vendor/lamejs-LICENSE.txt`. It can be replaced independently by a compatible
module. The JavaScript application imports this module only when exporting an
MP3. The original source and package are available at the links above.
