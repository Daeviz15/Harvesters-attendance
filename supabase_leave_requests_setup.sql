-- 1. Create the leave_requests table
CREATE TABLE leave_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Turn on RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for Workers
-- Workers can insert their own leave requests
CREATE POLICY "Users can insert their own leave requests"
ON leave_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Workers can view their own leave requests
CREATE POLICY "Users can view their own leave requests"
ON leave_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4. RLS Policies for Future Admins
-- Note: Requires the 'role' column in the 'profiles' table to be set to 'admin'
CREATE POLICY "Admins can view all leave requests"
ON leave_requests FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Admins can update all leave requests"
ON leave_requests FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);
