CREATE TABLE Users(
	UserID VARCHAR(50) PRIMARY KEY,
	Username VARCHAR(50) UNIQUE,
	PasswordHash VARCHAR(70),
	MiniumFreetime INT
)
CREATE TABLE Tasks(
	TaskID VARCHAR(50) PRIMARY KEY,
	UserID VARCHAR(50), --forein key
	Title NTEXT,
	Descriptions NTEXT,
	StartTime DATETIME NOT NULL,
	EndTime DATETIME NOT NULL,
	Color INT,
	Complete BIT NOT NULL,
	Reminder INT NULL,
	CONSTRAINT FK_UserID_Evs_Users FOREIGN KEY (UserID) REFERENCES Users(UserID),
	CONSTRAINT Condition_StartTime_EndTime CHECK(EndTime > StartTime)
)
CREATE TABLE TaskItems(
	TaskItemID VARCHAR(50) PRIMARY KEY,
	TaskID VARCHAR(50), --foreign key
	Content NTEXT,
	TaskItemWeight INT,
	Complete BIT NOT NULL,
	CONSTRAINT FK_TaskID_TaskItems_Tasks FOREIGN KEY(TaskID)REFERENCES Tasks(TaskID)
)