export const cssReset = css`
  @layer reset {
    /* based on https://www.joshwcomeau.com/css/custom-css-reset/ */

    /* 1. Use a more-intuitive box-sizing model */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* 2. Remove default margin */
    *:not(dialog) {
      margin: 0;
    }

    /* 3. Enable keyword animations */
    @media (prefers-reduced-motion: no-preference) {
      html {
        interpolate-size: allow-keywords;
      }
    }

    body {
      /* 4. Increase line-height */
      line-height: 1.5;
      /* 5. Improve text rendering */
      -webkit-font-smoothing: antialiased;
    }

    /* 6. Improve media defaults */
    img,
    picture,
    video,
    canvas,
    svg {
      display: block;
      max-width: 100%;
    }

    /* 7. Inherit fonts for form controls */
    input,
    button,
    textarea,
    select {
      font: inherit;
    }

    /* 8. Avoid text overflows */
    p,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      overflow-wrap: break-word;
    }

    /* 9. Improve line wrapping */
    p {
      text-wrap: pretty;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      text-wrap: balance;
    }

    /*
      10. Create a root stacking context
      (also for https://base-ui.com/react/overview/quick-start#portals)
    */
    #root,
    #__next {
      isolation: isolate;
    }
  }
`;

export const cssBase = css`
  @layer base {
    *:root {
      /* https://base-ui.com/react/overview/quick-start#ios-26-safari */
      position: relative;

      font-size: ${16 / 16}rem;
      color: var(--color-fg);
      background-color: var(--color-bg);
      font-family: "Rubik", Arial, sans-serif;

      /* design tokens */
      --color-white: rgb(250 250 250); /* https://web.dev/prefers-color-scheme/#avoid-pure-white */
      --color-black: #111214;
      --color-lightgrey: hsl(0, 0%, 80%);
      --color-red: oklch(48% 0.18 28);

      --color-fg: var(--color-black);
      --color-bg: var(--color-white);
      --color-selected: var(--color-lightgrey);
      --color-error: var(--color-red);

      --font-size-sm: 0.85rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-xxl: 1.5rem;
      --font-size-xxxl: 1.75rem;
      --font-size-xxxxl: 2rem;
      --font-weight-bold: 700;

      --spacing-base: 8px;
      --app-padding-block: calc(1 * var(--spacing-base));
      --app-padding-inline: calc(2 * var(--spacing-base));

      --selected-outline: 2px solid var(--color-fg);

      --border-radius: 4px;

      /* taken from MUI Snackbar https://mui.com/material-ui/react-snackbar/ */
      --mui-shadows-6:
        0px 3px 5px -1px rgba(0, 0, 0, 0.2), 0px 6px 10px 0px rgba(0, 0, 0, 0.14),
        0px 1px 18px 0px rgba(0, 0, 0, 0.12);
      --paper-shadow: var(
        --mui-shadows-6,
        0px 3px 5px -1px rgba(0, 0, 0, 0.2),
        0px 6px 10px 0px rgba(0, 0, 0, 0.14),
        0px 1px 18px 0px rgba(0, 0, 0, 0.12)
      );
    }
  }
`;

/**
 * This function just returns the template string. It's purpose is solely to have a function `css`
 * which will trigger CSS syntax highlighting in VS Code, extension
 * [`styled-components.vscode-styled-components`](https://marketplace.visualstudio.com/items?itemName=styled-components.vscode-styled-components).
 */
function css(strings: TemplateStringsArray, ...args: Array<string | number>): string {
  let result = strings[0] ?? "";
  for (const [i, arg] of args.entries()) {
    result += `${arg}${strings[i + 1]}`;
  }
  return result;
}
