// Test file to debug month progress tracking
console.log('Starting Progress Tracking Tests...\n');

// Mock data
const mockMonthItems = [
  { id: '1', uri: 'photo1.jpg' },
  { id: '2', uri: 'photo2.jpg' },
  { id: '3', uri: 'photo3.jpg' },
  { id: '4', uri: 'photo4.jpg' },
  { id: '5', uri: 'photo5.jpg' },
];

// Test the progress calculation
function testProgressCalculation() {
  console.log('=== Testing Progress Calculation ===');

  // Test 1: View 1 out of 5 photos
  const viewedCount1 = 1;
  const totalItems1 = mockMonthItems.length;
  const percentage1 =
    totalItems1 > 0 ? Math.round((viewedCount1 / totalItems1) * 100) : 0;
  console.log(
    `Viewed ${viewedCount1} out of ${totalItems1} photos: ${percentage1}%`,
  );

  // Test 2: View 3 out of 5 photos
  const viewedCount2 = 3;
  const percentage2 =
    totalItems1 > 0 ? Math.round((viewedCount2 / totalItems1) * 100) : 0;
  console.log(
    `Viewed ${viewedCount2} out of ${totalItems1} photos: ${percentage2}%`,
  );

  // Test 3: View all 5 photos
  const viewedCount3 = 5;
  const percentage3 =
    totalItems1 > 0 ? Math.round((viewedCount3 / totalItems1) * 100) : 0;
  console.log(
    `Viewed ${viewedCount3} out of ${totalItems1} photos: ${percentage3}%`,
  );

  // Test edge cases
  console.log('\n=== Edge Cases ===');
  console.log('Empty month (0 items):', 0 > 0 ? Math.round((1 / 0) * 100) : 0);
  console.log('Single photo (1 item):', 1 > 0 ? Math.round((1 / 1) * 100) : 0);
}

// Test the MediaViewer photo tracking logic
function testPhotoTracking() {
  console.log('\n=== Testing Photo Tracking ===');

  const initialIndex = 0;
  const viewedPhotos = new Set([initialIndex]);
  console.log('Initial state:', Array.from(viewedPhotos));

  // Simulate viewing photo at index 2
  viewedPhotos.add(2);
  console.log('After viewing photo 2:', Array.from(viewedPhotos));

  // Simulate viewing photo at index 4
  viewedPhotos.add(4);
  console.log('After viewing photo 4:', Array.from(viewedPhotos));

  console.log('Total viewed photos:', viewedPhotos.size);
  console.log(
    'Percentage:',
    Math.round((viewedPhotos.size / mockMonthItems.length) * 100) + '%',
  );
}

// Test the markMonthAsViewed function logic
function testMarkMonthAsViewed() {
  console.log('\n=== Testing markMonthAsViewed ===');

  const monthKey = '2024-01';
  const viewedCount = 2; // User viewed 2 photos
  const totalItems = mockMonthItems.length;
  const percentage =
    totalItems > 0 ? Math.round((viewedCount / totalItems) * 100) : 0;

  console.log(`Month: ${monthKey}`);
  console.log(`Viewed: ${viewedCount} photos`);
  console.log(`Total: ${totalItems} photos`);
  console.log(`Percentage: ${percentage}%`);

  // This should be called when viewer closes
  console.log('Result: markMonthAsViewed called with:', {
    monthKey,
    viewedCount,
    percentage,
  });
}

// Test the current issue - why it's showing 100%
function testCurrentIssue() {
  console.log('\n=== Testing Current Issue ===');

  // Simulate what happens when opening a month
  console.log('1. User opens month with 5 photos');
  console.log('2. MediaViewer initializes with viewedPhotos = new Set([0])');
  console.log('3. User views first photo (index 0)');
  console.log('4. User navigates to photo 2 (index 1)');
  console.log('5. User navigates to photo 3 (index 2)');
  console.log('6. User closes viewer');

  const viewedPhotos = new Set([0, 1, 2]); // User viewed 3 photos
  const totalPhotos = 5;
  const actualViewedCount = viewedPhotos.size;
  const percentage = Math.round((actualViewedCount / totalPhotos) * 100);

  console.log(`\nActual viewed: ${actualViewedCount}`);
  console.log(`Total photos: ${totalPhotos}`);
  console.log(`Should show: ${percentage}%`);
  console.log(`If showing 100%, there's a bug in the tracking logic`);
}

// Run all tests
testProgressCalculation();
testPhotoTracking();
testMarkMonthAsViewed();
testCurrentIssue();
console.log('\nTests completed!');
