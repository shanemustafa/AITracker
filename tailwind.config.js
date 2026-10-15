/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-dark="true"]'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)', surface: 'var(--surface)', raised: 'var(--raised)', fill: 'var(--fill)', glass: 'var(--glass)',
        ink: 'var(--ink)', ink2: 'var(--ink2)', muted: 'var(--muted)', line: 'var(--line)',
        accent: 'var(--accent)', accentInk: 'var(--accent-ink)', accentSoft: 'var(--accent-soft)',
        good: 'var(--good)', goodSoft: 'var(--good-soft)', bad: 'var(--bad)', badSoft: 'var(--bad-soft)', warnBg: 'var(--warn-bg)', warnInk: 'var(--warn-ink)',
      },
      // Apple's own system font on Apple devices; Inter elsewhere.
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', '"Helvetica Neue"', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.05)',
        lift: '0 2px 6px rgba(0,0,0,0.06), 0 18px 48px rgba(0,0,0,0.10)',
        thumb: '0 1px 3px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)',
      },
      letterSpacing: { display: '-0.022em', title: '-0.015em' },
    },
  },
  plugins: [],
};
