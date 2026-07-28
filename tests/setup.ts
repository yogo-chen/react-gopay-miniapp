const originalCreateElement = document.createElement.bind(document)

// The loader injects a <script> pointing at the live GoPay CDN. Under browser-mode
// tests that request is real: the SDK loads, defines a genuine window.gpContainer,
// and clobbers whichever per-test mock is in place when it lands — so unrelated
// tests fail depending on network timing.
//
// Giving injected scripts a non-JS type stops the browser fetching or executing
// them while leaving the element and its src intact, so selectors and assertions
// still work and tests stay in control by dispatching load/error themselves.
document.createElement = function (
  tagName: string,
  options?: ElementCreationOptions
) {
  const element = originalCreateElement(tagName as 'script', options)

  if (String(tagName).toLowerCase() === 'script') {
    ;(element as HTMLScriptElement).type = 'javascript/blocked'
  }

  return element
} as typeof document.createElement
