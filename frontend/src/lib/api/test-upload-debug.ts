// Debug test for upload functionality
export function createTestFile(name: string = 'test.pdf', content: string = 'test content'): File {
  const blob = new Blob([content], { type: 'application/pdf' });
  const file = new File([blob], name, { type: 'application/pdf', lastModified: Date.now() });
  
  console.log('Created test file:', {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified
  });
  
  return file;
}

// Test the upload process step by step
export async function testUploadProcess() {
  const testFile = createTestFile('test-document.pdf', 'This is a test PDF document content');
  
  console.log('Testing upload process with file:', testFile);
  
  // Import the document service
  const { default: documentService } = await import('./documents');
  
  const metadata = {
    category: 'contract' as const,
    description: 'Test document upload',
    tags: ['test', 'debug']
  };
  
  console.log('Starting upload with metadata:', metadata);
  
  try {
    const result = await documentService.uploadDocument(testFile, metadata, (progress) => {
      console.log('Upload progress:', progress + '%');
    });
    
    console.log('Upload result:', result);
    return result;
  } catch (error) {
    console.error('Upload test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Make it available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testUpload = testUploadProcess;
  (window as any).createTestFile = createTestFile;
}
