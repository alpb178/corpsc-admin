import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without Vitest's globals Testing Library can't register this itself.
afterEach(() => cleanup());
