/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-dark="true"]'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)', surface: 'var(--surface)', raised: 'var(--raised)', ink: 'var(--ink)', ink2: 'var(--ink2)',
        muted: 'var(--muted)', line: 'var(--line)', accent: 'var(--accent)', accentInk: 'var(--accent-ink)', accentSoft: 'var(--accent-soft)',
        good: 'var(--good)', bad: 'var(--bad)', warnBg: 'var(--warn-bg)', warnInk: 'var(--warn-ink)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      borderRadius: { xl: '14px' },
    },
  },
  plugins: [],
};
