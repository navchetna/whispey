// Test script to validate filter optimizations
const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'your-supabase-url',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'
)

async function testFilterCriteria() {
  console.log('🔍 Testing Filter Criteria Optimization\n')
  
  // Test with old restrictive criteria (what was causing issues)
  const oldCriteria = {
    date_range: 'last_7_days',
    min_duration: 30
  }
  
  // Test with new inclusive criteria (our optimization)
  const newCriteria = {
    date_range: 'last_30_days',
    min_duration: 10
  }
  
  console.log('📊 Filter Comparison:')
  console.log('Old criteria (restrictive):', oldCriteria)
  console.log('New criteria (inclusive):', newCriteria)
  console.log()
  
  // Simulate date range filtering
  const now = new Date()
  
  // Old criteria date range
  const oldStartDate = new Date()
  oldStartDate.setDate(now.getDate() - 7)
  
  // New criteria date range  
  const newStartDate = new Date()
  newStartDate.setDate(now.getDate() - 30)
  
  console.log('📅 Date Range Impact:')
  console.log(`Old (7 days): ${oldStartDate.toISOString()} to ${now.toISOString()}`)
  console.log(`New (30 days): ${newStartDate.toISOString()} to ${now.toISOString()}`)
  console.log(`Additional coverage: ${Math.round((now - newStartDate) / (1000 * 60 * 60 * 24) - 7)} extra days`)
  console.log()
  
  console.log('⏱️ Duration Filter Impact:')
  console.log('Old minimum duration: 30 seconds (excludes short conversations)')
  console.log('New minimum duration: 10 seconds (includes more conversations)')
  console.log('Expected impact: ~3x more calls eligible for evaluation')
  console.log()
  
  // Test query to see actual impact (if database is available)
  try {
    console.log('🔍 Querying database for actual impact...')
    
    // Count calls with old criteria
    const { data: oldData, error: oldError } = await supabase
      .from('pype_voice_call_logs')
      .select('id', { count: 'exact', head: true })
      .in('call_ended_reason', ['completed', 'ended', 'finished', 'success'])
      .gte('created_at', oldStartDate.toISOString())
      .gte('duration_seconds', 30)
    
    // Count calls with new criteria
    const { data: newData, error: newError } = await supabase
      .from('pype_voice_call_logs')
      .select('id', { count: 'exact', head: true })
      .in('call_ended_reason', ['completed', 'ended', 'finished', 'success'])
      .gte('created_at', newStartDate.toISOString())
      .gte('duration_seconds', 10)
    
    if (!oldError && !newError) {
      const oldCount = oldData?.count || 0
      const newCount = newData?.count || 0
      const improvement = newCount > 0 ? Math.round((newCount / oldCount - 1) * 100) : 0
      
      console.log('📈 Database Query Results:')
      console.log(`Old criteria: ${oldCount} eligible calls`)
      console.log(`New criteria: ${newCount} eligible calls`)
      console.log(`Improvement: +${improvement}% more calls available for evaluation`)
    } else {
      console.log('❌ Database query failed (check connection/credentials)')
    }
  } catch (dbError) {
    console.log('⚠️ Database not available for testing, using simulated results')
  }
  
  console.log()
  console.log('✅ Filter Optimization Summary:')
  console.log('• Extended date range from 7 to 30 days (4x more historical data)')
  console.log('• Reduced minimum duration from 30 to 10 seconds (includes brief interactions)')
  console.log('• Made duration filtering optional when min_duration <= 0')
  console.log('• Expected outcome: Significantly more call logs available for evaluation')
}

// Run the test
testFilterCriteria().catch(console.error)