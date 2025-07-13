import { Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

export const MEDIA_PERMISSIONS = {
  ios: [PERMISSIONS.IOS.PHOTO_LIBRARY],
  android: [
    PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
    PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
    PERMISSIONS.ANDROID.READ_MEDIA_VIDEO,
  ],
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const debugPermissionState = async (): Promise<void> => {
  if (__DEV__) {
    try {
      const permissions =
        Platform.OS === 'ios'
          ? MEDIA_PERMISSIONS.ios
          : MEDIA_PERMISSIONS.android;
      const results = await Promise.all(
        permissions.map(async permission => {
          const result = await check(permission);
          return { permission, result };
        }),
      );
    } catch (error) {
      console.log('[Permission Debug] Error checking permissions:', error);
    }
  }
};

export const requestMediaPermissions = async (): Promise<boolean> => {
  await debugPermissionState();

  try {
    const permissions =
      Platform.OS === 'ios' ? MEDIA_PERMISSIONS.ios : MEDIA_PERMISSIONS.android;

    const results = await Promise.all(
      permissions.map(permission => request(permission)),
    );

    // For iOS, we accept both GRANTED and LIMITED permissions
    if (Platform.OS === 'ios') {
      const hasPermission =
        results[0] === RESULTS.GRANTED || results[0] === RESULTS.LIMITED;

      // On iPad, sometimes there's a delay before the permission is properly registered
      // If we got permission but it's on iOS, let's double-check after a short delay
      if (hasPermission && Platform.OS === 'ios') {
        await delay(1000); // Wait 1 second for iOS to register the permission
        return checkMediaPermissionsWithRetry();
      }

      return hasPermission;
    }

    // For Android, we need at least one read permission
    const hasReadPermission = results.some(
      result => result === RESULTS.GRANTED,
    );

    return hasReadPermission;
  } catch (error) {
    console.log('[Permission Debug] Error requesting permissions:', error);
    // If permission request fails, try to check current permissions as fallback
    return checkMediaPermissionsWithRetry();
  }
};

export const checkMediaPermissionsWithRetry = async (
  maxRetries: number = 3,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await checkMediaPermissions();
      if (result) {
        return true;
      }

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // Progressive delay: 1s, 2s, 3s
      }
    } catch (error) {
      if (attempt === maxRetries) {
        return false;
      }
      // Wait before retrying on error
      await delay(1000 * attempt);
    }
  }

  return false;
};

export const checkMediaPermissions = async (): Promise<boolean> => {
  try {
    const permissions =
      Platform.OS === 'ios' ? MEDIA_PERMISSIONS.ios : MEDIA_PERMISSIONS.android;

    const results = await Promise.all(
      permissions.map(permission => check(permission)),
    );

    // For iOS, we accept both GRANTED and LIMITED permissions
    if (Platform.OS === 'ios') {
      return results[0] === RESULTS.GRANTED || results[0] === RESULTS.LIMITED;
    }

    // For Android, we need at least one read permission
    const hasReadPermission = results.some(
      result => result === RESULTS.GRANTED,
    );

    return hasReadPermission;
  } catch (error) {
    return false;
  }
};
