-- Performance indexes for foreign-key columns that are used in hot query
-- paths but were previously unindexed (every FK lookup was a sequential scan
-- once the tables grew).
--
-- Additive and non-destructive: only CREATE INDEX statements, no data changes.
-- IF NOT EXISTS keeps the migration safe to re-run.

-- Course → Semester / Teacher
CREATE INDEX IF NOT EXISTS "Course_semesterId_idx" ON "Course"("semesterId");
CREATE INDEX IF NOT EXISTS "Course_teacherId_idx" ON "Course"("teacherId");

-- Material → Course
CREATE INDEX IF NOT EXISTS "Material_courseId_idx" ON "Material"("courseId");

-- Question → QuizBank / Quiz
CREATE INDEX IF NOT EXISTS "Question_quizBankId_idx" ON "Question"("quizBankId");
CREATE INDEX IF NOT EXISTS "Question_quizId_idx" ON "Question"("quizId");

-- QuizAttempt → User / Quiz
CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");
CREATE INDEX IF NOT EXISTS "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

-- QuizAnswer → Attempt / Question
CREATE INDEX IF NOT EXISTS "QuizAnswer_attemptId_idx" ON "QuizAnswer"("attemptId");
CREATE INDEX IF NOT EXISTS "QuizAnswer_questionId_idx" ON "QuizAnswer"("questionId");

-- Forum → section / author
CREATE INDEX IF NOT EXISTS "ForumPost_sectionId_idx" ON "ForumPost"("sectionId");
CREATE INDEX IF NOT EXISTS "ForumPost_authorId_idx" ON "ForumPost"("authorId");
CREATE INDEX IF NOT EXISTS "ForumReply_postId_idx" ON "ForumReply"("postId");
CREATE INDEX IF NOT EXISTS "ForumReply_authorId_idx" ON "ForumReply"("authorId");

-- Announcement → Course
CREATE INDEX IF NOT EXISTS "Announcement_courseId_idx" ON "Announcement"("courseId");

-- Report → reporter
CREATE INDEX IF NOT EXISTS "Report_reporterId_idx" ON "Report"("reporterId");

-- AiHistory → User
CREATE INDEX IF NOT EXISTS "AiHistory_userId_idx" ON "AiHistory"("userId");
