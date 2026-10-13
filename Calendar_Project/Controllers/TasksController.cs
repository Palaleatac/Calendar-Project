using Calendar_Project.Data;
using Calendar_Project.Models;
using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Net;
using System.Web.Http;

namespace Calendar_Project.Controllers
{
    [RoutePrefix("api/tasks")]
    public class TasksController : ApiController
    {
        private static string Validate(TaskDto t)
        {
            if (t == null) return "Thiếu dữ liệu.";
            if (string.IsNullOrWhiteSpace(t.UserId)) return "Thiếu UserID.";
            if (string.IsNullOrWhiteSpace(t.Title)) return "Thiếu tiêu đề cho task.";
            if (t.EndTime <= t.StartTime) return "Thời gian kết thúc phải sau thời gian bắt đầu.";
            if (t.Color < 0 || t.Color > 5) return "Color phải từ 0 đến 5.";
            if (t.Reminder.HasValue && t.Reminder.Value < 0) return "Reminder phải >=0 hoặc Bỏ qua nếu không muốn Remind.";
            return null;
        }

        private IHttpActionResult Error(HttpStatusCode code, string msg)
        {
            return Content(code, new { error = msg });
        }

        // GET api/tasks?userId=...&start=...&end=...
        [HttpGet, Route("")]
        public IHttpActionResult GetTasks(string userId, DateTime? start = null, DateTime? end = null)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Error(HttpStatusCode.BadRequest, "Thiếu userId.");

            try
            {
                var list = new List<TaskDto>();
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    SELECT t.TaskID, t.UserID, t.Title, t.Descriptions, t.StartTime, t.EndTime,
                           t.Color, t.Complete, t.Reminder,
                           (SELECT CAST(ROUND(SUM(CASE WHEN i.Complete = 1 THEN i.TaskItemWeight ELSE 0 END) * 100.0
                                              / SUM(i.TaskItemWeight), 0) AS INT)
                            FROM TaskItems i WHERE i.TaskID = t.TaskID) AS Progress
                    FROM Tasks t
                    WHERE t.UserID = @userId
                      AND (@end IS NULL OR t.StartTime < @end)
                      AND (@start IS NULL OR t.EndTime > @start)
                    ORDER BY t.StartTime", conn))
                {
                    cmd.Parameters.AddWithValue("@userId", userId);
                    cmd.Parameters.AddWithValue("@start", (object)start ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@end", (object)end ?? DBNull.Value);

                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new TaskDto
                            {
                                TaskId = r.GetString(0),
                                UserId = r.GetString(1),
                                Title = r.IsDBNull(2) ? null : r.GetString(2),
                                Descriptions = r.IsDBNull(3) ? null : r.GetString(3),
                                StartTime = r.GetDateTime(4),
                                EndTime = r.GetDateTime(5),
                                Color = r.IsDBNull(6) ? 0 : r.GetInt32(6),
                                Complete = r.GetBoolean(7),
                                Reminder = r.IsDBNull(8) ? (int?)null : r.GetInt32(8),
                                Progress = r.IsDBNull(9) ? (int?)null : r.GetInt32(9)
                            });
                        }
                    }
                }
                return Ok(list);
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        // POST api/tasks
        [HttpPost, Route("")]
        public IHttpActionResult Create(TaskDto t)
        {
            var err = Validate(t);
            if (err != null) return Error(HttpStatusCode.BadRequest, err);

            try
            {
                t.TaskId = Guid.NewGuid().ToString();
                t.Complete = false;

                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    INSERT INTO Tasks (TaskID, UserID, Title, Descriptions, StartTime, EndTime, Color, Complete, Reminder)
                    VALUES (@id, @userId, @title, @desc, @start, @end, @color, 0, @reminder)", conn))
                {
                    cmd.Parameters.AddWithValue("@id", t.TaskId);
                    cmd.Parameters.AddWithValue("@userId", t.UserId);
                    cmd.Parameters.AddWithValue("@title", t.Title.Trim());
                    cmd.Parameters.AddWithValue("@desc", (object)t.Descriptions ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", t.StartTime);
                    cmd.Parameters.AddWithValue("@end", t.EndTime);
                    cmd.Parameters.AddWithValue("@color", t.Color);
                    cmd.Parameters.AddWithValue("@reminder", t.Reminder.HasValue ? (object)t.Reminder.Value : DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
                return Ok(t);
            }
            catch (SqlException ex) when (ex.Number == 547)   // vi phạm khóa ngoại: userId không tồn tại
            {
                return Error(HttpStatusCode.BadRequest, "userId không tồn tại.");
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        // PUT api/tasks/{id}   (body có userId để xác định chủ sở hữu)
        [HttpPut, Route("{id}")]
        public IHttpActionResult Update(string id, TaskDto t)
        {
            var err = Validate(t);
            if (err != null) return Error(HttpStatusCode.BadRequest, err);

            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    UPDATE Tasks
                    SET Title = @title, Descriptions = @desc, StartTime = @start, EndTime = @end,
                        Color = @color, Complete = @complete, Reminder = @reminder
                    WHERE TaskID = @id AND UserID = @userId", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@userId", t.UserId);
                    cmd.Parameters.AddWithValue("@title", t.Title.Trim());
                    cmd.Parameters.AddWithValue("@desc", (object)t.Descriptions ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", t.StartTime);
                    cmd.Parameters.AddWithValue("@end", t.EndTime);
                    cmd.Parameters.AddWithValue("@color", t.Color);
                    cmd.Parameters.AddWithValue("@complete", t.Complete);
                    cmd.Parameters.AddWithValue("@reminder", t.Reminder.HasValue ? (object)t.Reminder.Value : DBNull.Value);

                    if (cmd.ExecuteNonQuery() == 0)
                        return Error(HttpStatusCode.NotFound, "Không tìm thấy task.");
                }
                t.TaskId = id;
                return Ok(t);
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        // DELETE api/tasks/{id}?userId=...   (TaskItems tự xóa nhờ ON DELETE CASCADE)
        [HttpDelete, Route("{id}")]
        public IHttpActionResult Delete(string id, string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Error(HttpStatusCode.BadRequest, "Thiếu userId.");

            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(
                    "DELETE FROM Tasks WHERE TaskID = @id AND UserID = @userId", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@userId", userId);

                    if (cmd.ExecuteNonQuery() == 0)
                        return Error(HttpStatusCode.NotFound, "Không tìm thấy task.");
                }
                return Ok(new { deleted = true });
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }
    }
}