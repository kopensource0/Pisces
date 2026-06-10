import { useState, useCallback, useEffect } from 'react';
import type { LLMConfig, LLMProvider } from '../types/llm';
import { PROVIDER_DEFAULTS } from '../types/llm';

const DEFAULT_CONFIG: LLMConfig = {
  activeProvider: 'openai',
  providers: {},
};

export function useLLMConfig() {
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  // Load config on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;
    window.electronAPI.loadLLMConfig().then((saved) => {
      if (cancelled) return;
      if (saved && typeof saved === 'object') {
        setConfig(saved as unknown as LLMConfig);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (newConfig: LLMConfig) => {
    setConfig(newConfig);
    if (window.electronAPI) {
      await window.electronAPI.saveLLMConfig(newConfig);
    }
  }, []);

  const setProvider = useCallback((provider: LLMProvider) => {
    setConfig(prev => {
      const next = { ...prev, activeProvider: provider };
      if (window.electronAPI) window.electronAPI.saveLLMConfig(next);
      return next;
    });
  }, []);

  const setApiKey = useCallback((apiKey: string) => {
    setConfig(prev => {
      const p = prev.activeProvider;
      const existing = prev.providers[p] || { apiKey: '', model: PROVIDER_DEFAULTS[p].models[0] || '' };
      const next: LLMConfig = {
        ...prev,
        providers: { ...prev.providers, [p]: { ...existing, apiKey } },
      };
      if (window.electronAPI) window.electronAPI.saveLLMConfig(next);
      return next;
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setConfig(prev => {
      const p = prev.activeProvider;
      const existing = prev.providers[p] || { apiKey: '', model: '' };
      const next: LLMConfig = {
        ...prev,
        providers: { ...prev.providers, [p]: { ...existing, model } },
      };
      if (window.electronAPI) window.electronAPI.saveLLMConfig(next);
      return next;
    });
  }, []);

  const setBaseUrl = useCallback((baseUrl: string) => {
    setConfig(prev => {
      const p = prev.activeProvider;
      const existing = prev.providers[p] || { apiKey: '', model: '' };
      const next: LLMConfig = {
        ...prev,
        providers: { ...prev.providers, [p]: { ...existing, baseUrl } },
      };
      if (window.electronAPI) window.electronAPI.saveLLMConfig(next);
      return next;
    });
  }, []);

  const deleteConfig = useCallback(async () => {
    setConfig(DEFAULT_CONFIG);
    if (window.electronAPI) await window.electronAPI.deleteLLMConfig();
  }, []);

  const activeProvider = config.activeProvider;
  const activeConfig = config.providers[activeProvider];
  const defaults = PROVIDER_DEFAULTS[activeProvider];

  return {
    config,
    loaded,
    save,
    activeProvider,
    activeConfig,
    defaults,
    setProvider,
    setApiKey,
    setModel,
    setBaseUrl,
    deleteConfig,
  };
}
