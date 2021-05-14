import DetaClass from './deta';

/**
 * Deta returns instance of Deta class
 *
 * @param {string} [projectKey]
 * @returns {DetaClass}
 */
export function Deta(projectKey?: string): DetaClass {
  const key = projectKey?.trim() || process.env.DETA_PROJECT_KEY?.trim();
  if (!key) {
    throw new Error('Project key is not defined');
  }
  return new DetaClass(key);
}
