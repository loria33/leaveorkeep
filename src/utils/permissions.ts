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

export const requestMediaPermissions = async (): Promise<boolean> => {
  try {
    const permissions =
      Platform.OS === 'ios' ? MEDIA_PERMISSIONS.ios : MEDIA_PERMISSIONS.android;

    const results = await Promise.all(
      permissions.map(permission => request(permission)),
    );

    return results.every(result => result === RESULTS.GRANTED);
  } catch (error) {
    console.error('Error requesting media permissions:', error);
    return false;
  }
};

export const checkMediaPermissions = async (): Promise<boolean> => {
  try {
    const permissions =
      Platform.OS === 'ios' ? MEDIA_PERMISSIONS.ios : MEDIA_PERMISSIONS.android;

    const results = await Promise.all(
      permissions.map(permission => check(permission)),
    );

    return results.every(result => result === RESULTS.GRANTED);
  } catch (error) {
    console.error('Error checking media permissions:', error);
    return false;
  }
};
