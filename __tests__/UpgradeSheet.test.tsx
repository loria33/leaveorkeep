import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import UpgradeSheet from '../src/components/UpgradeSheet';

const mockGetProducts = jest.fn();
const mockPurchaseRemoveAds = jest.fn();
const mockCheckPremiumStatus = jest.fn();
const mockRestorePurchases = jest.fn();

jest.mock('../src/utils/InAppPurchaseManager', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getProducts: mockGetProducts,
      purchaseRemoveAds: mockPurchaseRemoveAds,
      checkPremiumStatus: mockCheckPremiumStatus,
      restorePurchases: mockRestorePurchases,
    }),
  },
}));

const mockSetPremiumStatus = jest.fn(async () => undefined);

const makeMedia = (overrides: Record<string, unknown> = {}) => ({
  viewingLimits: {
    viewCount: 15,
    lastResetTime: 0,
    isBlocked: false,
    remainingViews: 40,
    currentHour: 0,
  },
  isPremiumUser: false,
  getRemainingCooldownTime: () => 0,
  setPremiumStatus: mockSetPremiumStatus,
  ...overrides,
});

let mockMedia = makeMedia();
jest.mock('../src/context/MediaContext', () => ({
  useMedia: () => mockMedia,
}));

jest.useFakeTimers();

type Renderer = ReactTestRenderer.ReactTestRenderer;

const flush = async (ms = 0) => {
  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const render = async (
  props: { visible?: boolean; onClose?: () => void } = {},
) => {
  let renderer: Renderer | undefined;
  // Async act so the mount-time price fetch settles inside the act scope
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <UpgradeSheet
        visible={props.visible ?? true}
        onClose={props.onClose ?? jest.fn()}
      />,
    );
  });
  await flush();
  return renderer!;
};

const allText = (renderer: Renderer) =>
  renderer.root
    .findAllByType(Text)
    .flatMap(node => [node.props.children].flat(Infinity))
    .filter(child => typeof child === 'string' || typeof child === 'number')
    .join(' ');

const press = async (renderer: Renderer, testID: string) => {
  const node = renderer.root.findAll(
    n => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0];
  expect(node).toBeDefined();
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMedia = makeMedia();
  mockGetProducts.mockResolvedValue([]);
});

describe('UpgradeSheet', () => {
  it('renders nothing while hidden', async () => {
    const renderer = await render({ visible: false });
    expect(renderer.toJSON()).toBeNull();
  });

  it('shows where the user stands and the offer', async () => {
    const renderer = await render();
    const text = allText(renderer);
    expect(text).toContain('40');
    expect(text).toContain('of 55 free views left');
    expect(text).toContain('refill 15 minutes');
    expect(text).toContain('Upgrade to Premium');
    expect(text).toContain('Restore Purchases');
  });

  it('shows the localised price when the store provides one', async () => {
    mockGetProducts.mockResolvedValue([{ displayPrice: '$2.99' }]);
    const renderer = await render();
    expect(allText(renderer)).toContain('$2.99 · one-time purchase');
  });

  it('counts down to the refill once the limit is hit', async () => {
    let remaining = 754_000; // 12:34
    mockMedia = makeMedia({
      viewingLimits: {
        viewCount: 55,
        lastResetTime: Date.now(),
        isBlocked: true,
        remainingViews: 0,
        currentHour: 0,
      },
      getRemainingCooldownTime: () => remaining,
    });
    const renderer = await render();
    expect(allText(renderer)).toContain('12:34');
    expect(allText(renderer)).toContain('until your free views refill');

    remaining = 753_000;
    await flush(1000);
    expect(allText(renderer)).toContain('12:33');
  });

  it('activates premium and celebrates after a confirmed purchase', async () => {
    mockPurchaseRemoveAds.mockResolvedValue(true);
    mockCheckPremiumStatus.mockResolvedValue(true);
    const renderer = await render();

    await press(renderer, 'upgrade-cta');
    await flush(1000);

    expect(mockPurchaseRemoveAds).toHaveBeenCalledTimes(1);
    expect(mockSetPremiumStatus).toHaveBeenCalledWith(true);
    expect(allText(renderer)).toContain("You're Premium");
  });

  it('stays quiet when the user cancels in the store sheet', async () => {
    mockPurchaseRemoveAds.mockResolvedValue(false);
    const renderer = await render();

    await press(renderer, 'upgrade-cta');

    expect(
      renderer.root.findAllByProps({ testID: 'upgrade-error' }),
    ).toHaveLength(0);
    expect(allText(renderer)).toContain('Upgrade to Premium');
    expect(mockSetPremiumStatus).not.toHaveBeenCalled();
  });

  it('explains a failed purchase inline', async () => {
    mockPurchaseRemoveAds.mockRejectedValue({
      code: 'E_UNKNOWN',
      message: 'Store unavailable',
    });
    const renderer = await render();

    await press(renderer, 'upgrade-cta');

    expect(allText(renderer)).toContain('Store unavailable');
    expect(allText(renderer)).toContain('Upgrade to Premium');
  });

  it('restores a previous purchase', async () => {
    mockRestorePurchases.mockResolvedValue(true);
    mockCheckPremiumStatus.mockResolvedValue(true);
    const renderer = await render();

    await press(renderer, 'upgrade-restore');

    expect(mockSetPremiumStatus).toHaveBeenCalledWith(true);
    expect(allText(renderer)).toContain("You're Premium");
  });

  it('says so when there is nothing to restore', async () => {
    mockRestorePurchases.mockResolvedValue(false);
    const renderer = await render();

    await press(renderer, 'upgrade-restore');

    expect(allText(renderer)).toContain('No previous purchase was found');
  });

  it('closes from "Not now"', async () => {
    const onClose = jest.fn();
    const renderer = await render({ onClose });

    await press(renderer, 'upgrade-dismiss');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
