// Apply the saved light/dark choice before the page draws, to avoid a flash.
try { var t = localStorage.getItem('theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
