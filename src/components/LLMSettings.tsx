import { useState } from 'react';
import type { LLMProvider } from '../types/llm';
import { PROVIDER_DEFAULTS } from '../types/llm';

interface LLMSettingsProps {
  visible: boolean;
  activeProvider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  onProviderChange: (p: LLMProvider) => void;
  onApiKeyChange: (key: string) => void;
  onModelChange: (model: string) => void;
  onBaseUrlChange: (url: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function LLMSettings({
  visible,
  activeProvider,
  apiKey,
  model,
  baseUrl,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  onBaseUrlChange,
  onDelete,
  onClose,
}: LLMSettingsProps) {
  const [customModel, setCustomModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  if (!visible) return null;

  const providers = Object.keys(PROVIDER_DEFAULTS) as LLMProvider[];
  const defaults = PROVIDER_DEFAULTS[activeProvider];
  const defaultBaseUrl = defaults.baseUrl;
  const effectiveBaseUrl = baseUrl || defaultBaseUrl;

  const handleAddCustomModel = () => {
    if (customModel.trim()) {
      onModelChange(customModel.trim());
      setCustomModel('');
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>LLM Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-field">
            <label>Provider</label>
            <select
              value={activeProvider}
              onChange={e => onProviderChange(e.target.value as LLMProvider)}
            >
              {providers.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <label>API Key</label>
            <div className="settings-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => onApiKeyChange(e.target.value)}
                placeholder={activeProvider === 'ollama' ? 'Not required for Ollama' : 'Enter your API key'}
              />
              <button
                className="settings-toggle-key"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>Model</label>
            {defaults.models.length > 0 ? (
              <div className="settings-model-group">
                <select value={model} onChange={e => onModelChange(e.target.value)}>
                  <option value="">Select a model</option>
                  {defaults.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {model && !defaults.models.includes(model) && (
                    <option value={model}>{model} (custom)</option>
                  )}
                </select>
                <div className="settings-custom-model">
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="Custom model name"
                    onKeyDown={e => e.key === 'Enter' && handleAddCustomModel()}
                  />
                  <button onClick={handleAddCustomModel}>Add</button>
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={model}
                onChange={e => onModelChange(e.target.value)}
                placeholder="Enter model name"
              />
            )}
          </div>

          <div className="settings-field">
            <label>Base URL</label>
            <input
              type="text"
              value={effectiveBaseUrl}
              onChange={e => onBaseUrlChange(e.target.value)}
              placeholder={defaultBaseUrl}
            />
            <span className="settings-hint">Leave empty to use default: {defaultBaseUrl}</span>
          </div>

          <div className="settings-actions">
            <button className="settings-delete-btn" onClick={onDelete}>
              Reset All Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
