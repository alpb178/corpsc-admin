// @vitest-environment node
import { track } from './client';

it('does nothing on the server, where there is no page', () => {
  expect(track('contact_submit')).toBe(false);
});
