import React, { useContext, useState, useEffect, ReactNode } from 'react';
import { Dimensions, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

interface AdminContextType {
  isTablet: boolean;
  screenWidth: number;
  screenHeight: number;
  isSmallScreen: boolean;
  isMediumScreen: boolean;
  isLargeScreen: boolean;
}

const AdminContext = React.createContext<AdminContextType | null>(null);

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Screen size calculations - use screen dimensions for mobile detection
  const isSmallScreen = screenWidth < 768; // Standard mobile breakpoint
  const isMediumScreen = screenWidth >= 768 && screenWidth < 1024;
  const isLargeScreen = screenWidth >= 1024;

  useEffect(() => {
    const initDeviceInfo = async () => {
      const deviceIsTablet = await DeviceInfo.isTablet();
      setIsTablet(deviceIsTablet);
    };
    initDeviceInfo();
  }, []);

  return (
    <AdminContext.Provider
      value={{
        isTablet,
        screenWidth,
        screenHeight,
        isSmallScreen,
        isMediumScreen,
        isLargeScreen,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within a AdminProvider');
  }
  return context;
};
