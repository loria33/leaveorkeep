/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// Fake timers: mount-time retry loops (permissions) and cooldown intervals
// (MediaContext) schedule real timers that would otherwise outlive the test.
jest.useFakeTimers();

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Unmount so effect cleanups run
  await ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});
