// Simple authentication helper for API routes - On-premise deployment
export function auth() {
  // For local deployment, we'll return a mock auth object
  // In a real implementation, you'd validate JWT tokens from headers
  return {
    userId: 'local-admin',
    user: {
      id: 'local-admin',
      email: 'admin@whispey.local'
    }
  }
}

export function currentUser() {
  // Mock current user for local deployment
  return Promise.resolve({
    id: 'local-admin',
    emailAddresses: [{ emailAddress: 'admin@whispey.local' }],
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@whispey.local'
  })
}

// Helper to get user ID from auth
export function getUserId() {
  const authData = auth()
  return authData.userId
}

// Helper to get user email from auth
export function getUserEmail() {
  const authData = auth()
  return authData.user.email
}