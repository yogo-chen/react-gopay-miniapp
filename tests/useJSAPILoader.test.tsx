import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJSAPILoader } from '../src'

describe('useJSAPILoader', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('should load script successfully', async () => {
    const { result } = renderHook(() => useJSAPILoader())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isLoaded).toBe(false)
    expect(result.current.error).toBe(null)

    const script = document.querySelector('script')
    expect(script).toBeTruthy()
    expect(script?.src).toContain('gp-container.min.js')

    script?.dispatchEvent(new Event('load'))

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should handle script load error', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useJSAPILoader({ onError }))

    const script = document.querySelector('script')
    const errorEvent = new Event('error')
    script?.dispatchEvent(errorEvent)

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
      expect(result.current.isLoading).toBe(false)
      expect(onError).toHaveBeenCalled()
    })
  })

  it('should call onLoad callback when script loads', async () => {
    const onLoad = vi.fn()
    renderHook(() => useJSAPILoader({ onLoad }))

    const script = document.querySelector('script')
    script?.dispatchEvent(new Event('load'))

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalled()
    })
  })

  it('should skip loading if skipIfExists returns true', () => {
    const onLoad = vi.fn()
    const skipIfExists = vi.fn(() => true)

    const { result } = renderHook(() => useJSAPILoader({ skipIfExists, onLoad }))

    expect(skipIfExists).toHaveBeenCalled()
    expect(result.current.isLoaded).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(onLoad).toHaveBeenCalled()
    expect(document.querySelector('script')).toBe(null)
  })

  it('should reuse existing script in DOM', async () => {
    const existingScript = document.createElement('script')
    existingScript.src = 'https://gwk.gopayapi.com/sdk/stable/gp-container.min.js'
    existingScript.setAttribute('data-loaded', 'true')
    document.head.appendChild(existingScript)

    const onLoad = vi.fn()
    const { result } = renderHook(() => useJSAPILoader({ onLoad }))

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
      expect(onLoad).toHaveBeenCalled()
    })

    const scripts = document.querySelectorAll('script')
    expect(scripts.length).toBe(1)
  })

  describe('existing script that has not finished loading', () => {
    const addPendingScript = () => {
      const script = document.createElement('script')
      script.src = 'https://gwk.gopayapi.com/sdk/stable/gp-container.min.js'
      document.head.appendChild(script)
      return script
    }

    it('should resolve when the existing script finishes loading', async () => {
      const existingScript = addPendingScript()
      const onLoad = vi.fn()

      const { result } = renderHook(() => useJSAPILoader({ onLoad }))

      expect(result.current.isLoaded).toBe(false)
      expect(document.querySelectorAll('script').length).toBe(1)

      existingScript.dispatchEvent(new Event('load'))

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true)
        expect(onLoad).toHaveBeenCalledTimes(1)
      })
    })

    it('should not invoke onLoad after unmount', () => {
      const existingScript = addPendingScript()
      const onLoad = vi.fn()

      const { unmount } = renderHook(() => useJSAPILoader({ onLoad }))

      unmount()
      existingScript.dispatchEvent(new Event('load'))

      expect(onLoad).not.toHaveBeenCalled()
    })

    it('should not stack listeners when a dependency changes', () => {
      const existingScript = addPendingScript()
      const onLoad = vi.fn()

      const { rerender } = renderHook(
        ({ async }: { async: boolean }) => useJSAPILoader({ onLoad, async }),
        { initialProps: { async: true } }
      )

      rerender({ async: false })
      rerender({ async: true })

      existingScript.dispatchEvent(new Event('load'))

      expect(onLoad).toHaveBeenCalledTimes(1)
    })

    it('should not stack listeners across re-renders with inline callbacks', () => {
      const existingScript = addPendingScript()
      const onLoad = vi.fn()

      const { rerender } = renderHook(() =>
        useJSAPILoader({ onLoad: () => onLoad(), skipIfExists: () => false })
      )

      for (let i = 0; i < 4; i++) rerender()

      existingScript.dispatchEvent(new Event('load'))

      expect(onLoad).toHaveBeenCalledTimes(1)
    })
  })

  describe('script stability across re-renders', () => {
    it('should not re-append the script when callback identities change', () => {
      const { rerender } = renderHook(() =>
        useJSAPILoader({
          onLoad: () => {},
          onError: () => {},
          skipIfExists: () => false
        })
      )

      const first = document.querySelector('script')
      expect(first).toBeTruthy()

      rerender()

      const scripts = document.querySelectorAll('script')
      expect(scripts.length).toBe(1)
      expect(scripts[0]).toBe(first)
      expect(first?.isConnected).toBe(true)
    })

    it('should keep the same script across many re-renders before load', () => {
      const { rerender } = renderHook(() => useJSAPILoader({ onLoad: () => {} }))

      const first = document.querySelector('script')

      for (let i = 0; i < 5; i++) rerender()

      expect(document.querySelectorAll('script').length).toBe(1)
      expect(document.querySelector('script')).toBe(first)
      expect(first?.isConnected).toBe(true)
    })

    it('should still remove the script on unmount', () => {
      const { unmount } = renderHook(() => useJSAPILoader())

      expect(document.querySelector('script')).toBeTruthy()

      unmount()

      expect(document.querySelector('script')).toBe(null)
    })

    const latestCallbackCases = [
      { name: 'onLoad', event: 'load' },
      { name: 'onError', event: 'error' }
    ] as const

    latestCallbackCases.forEach(({ name, event }) => {
      it(`should invoke the latest ${name} after a re-render`, async () => {
        const stale = vi.fn()
        const latest = vi.fn()

        const { rerender } = renderHook(
          ({ cb }: { cb: () => void }) => useJSAPILoader({ [name]: cb }),
          { initialProps: { cb: stale } }
        )

        rerender({ cb: latest })

        document.querySelector('script')?.dispatchEvent(new Event(event))

        await waitFor(() => {
          expect(latest).toHaveBeenCalled()
        })
        expect(stale).not.toHaveBeenCalled()
      })
    })

    it('should use the latest skipIfExists on a dependency-driven re-run', () => {
      const skipIfExists = vi.fn(() => false)

      const { rerender } = renderHook(
        ({ async }: { async: boolean }) => useJSAPILoader({ skipIfExists, async }),
        { initialProps: { async: true } }
      )

      expect(document.querySelector('script')?.async).toBe(true)

      skipIfExists.mockReturnValue(true)
      rerender({ async: false })

      expect(skipIfExists).toHaveBeenLastCalledWith()
      expect(skipIfExists.mock.results.at(-1)?.value).toBe(true)
    })
  })

  describe('script attributes', () => {
    const testCases = [
      { async: true, defer: false, name: 'async' },
      { async: false, defer: true, name: 'defer' },
      { async: true, defer: true, name: 'async and defer' },
    ]

    testCases.forEach(({ async, defer, name }) => {
      it(`should set ${name} attributes`, () => {
        renderHook(() => useJSAPILoader({ async, defer }))

        const script = document.querySelector('script')
        expect(script?.async).toBe(async)
        expect(script?.defer).toBe(defer)
      })
    })
  })
})
