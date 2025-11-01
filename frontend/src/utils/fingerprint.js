export const buildFingerprint = (item = {}) => {
  const core = {
    action: item.action || item.msg || '',
    description: item.description || item.reason || item.message || '',
    severity: (item.severity || item.priority || '').toLowerCase(),
    source: item.source || item.ruleId || item.sensor || '',
  };

  try {
    return JSON.stringify(core);
  } catch (err) {
    console.warn('无法为 Action 生成指纹，使用字符串化兜底', err);
    return `${core.action}|${core.description}|${core.severity}|${core.source}`;
  }
};
