using Calendar_Project.Data;
using Calendar_Project.Models;
using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Linq;
using System.Net;
using System.Web;
using System.Web.Http;

namespace Calendar_Project.Controllers
{
    [RoutePrefix("api/taskitems")]
    public class TaskItemsController : ApiController
    {
        private IHttpActionResult Error(HttpStatusCode code, string msg)
        {
            return Content(code, new { error = msg });
        }

        private static string Validate(TaskItemDto t, bool needTaskId)
        {
            if (t == null) return "Thiếu dữ liệu.";
            if (string.IsNullOrWhiteSpace(t.UserId)) return "Thiếu userId.";
            if (needTaskId && string.IsNullOrWhiteSpace(t.TaskId)) return "Thiếu taskId.";
            if (string.IsNullOrWhiteSpace(t.Content)) return "Nội dung không được để trống.";
            if (t.TaskItemWeight < 1 || t.TaskItemWeight > 100) return "Weight phải từ 1 đến 100.";
            return null;
        }

        // GET api/taskitems?userId=...&taskId=...
        [HttpGet, Route("")]
        public IHttpActionResult GetItems(string userId, string taskId)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(taskId))
                return Error(HttpStatusCode.BadRequest, "Thiếu userId hoặc taskId.");

            try
            {
                var list = new List<TaskItemDto>();
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    SELECT ti.TaskItemID, ti.TaskID, ti.Content, ti.TaskItemWeight, ti.Complete
                    FROM TaskItems ti
                    JOIN Tasks t ON t.TaskID = ti.TaskID
                    WHERE ti.TaskID = @taskId AND t.UserID = @userId
                    ORDER BY ti.TaskItemID", conn))
                {
                    cmd.Parameters.AddWithValue("@taskId", taskId);
                    cmd.Parameters.AddWithValue("@userId", userId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new TaskItemDto
                            {
                                TaskItemId = r.GetString(0),
                                TaskId = r.GetString(1),
                                Content = r.IsDBNull(2) ? null : r.GetString(2),
                                TaskItemWeight = r.IsDBNull(3) ? 1 : r.GetInt32(3),
                                Complete = r.GetBoolean(4)
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

        // POST api/taskitems
        [HttpPost, Route("")]
        public IHttpActionResult Create(TaskItemDto t)
        {
            var err = Validate(t, true);
            if (err != null) return Error(HttpStatusCode.BadRequest, err);

            try
            {
                t.TaskItemId = Guid.NewGuid().ToString();
                t.Complete = false;

                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    INSERT INTO TaskItems (TaskItemID, TaskID, Content, TaskItemWeight, Complete)
                    SELECT @id, @taskId, @content, @weight, 0
                    WHERE EXISTS (SELECT 1 FROM Tasks WHERE TaskID = @taskId AND UserID = @userId)", conn))
                {
                    cmd.Parameters.AddWithValue("@id", t.TaskItemId);
                    cmd.Parameters.AddWithValue("@taskId", t.TaskId);
                    cmd.Parameters.AddWithValue("@userId", t.UserId);
                    cmd.Parameters.AddWithValue("@content", t.Content.Trim());
                    cmd.Parameters.AddWithValue("@weight", t.TaskItemWeight);

                    if (cmd.ExecuteNonQuery() == 0)
                        return Error(HttpStatusCode.NotFound, "Không tìm thấy task cha.");
                }
                return Ok(t);
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        // PUT api/taskitems/{id}
        [HttpPut, Route("{id}")]
        public IHttpActionResult Update(string id, TaskItemDto t)
        {
            var err = Validate(t, false);
            if (err != null) return Error(HttpStatusCode.BadRequest, err);

            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    UPDATE ti
                    SET ti.Content = @content, ti.TaskItemWeight = @weight, ti.Complete = @complete
                    FROM TaskItems ti
                    JOIN Tasks t ON t.TaskID = ti.TaskID
                    WHERE ti.TaskItemID = @id AND t.UserID = @userId", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@userId", t.UserId);
                    cmd.Parameters.AddWithValue("@content", t.Content.Trim());
                    cmd.Parameters.AddWithValue("@weight", t.TaskItemWeight);
                    cmd.Parameters.AddWithValue("@complete", t.Complete);

                    if (cmd.ExecuteNonQuery() == 0)
                        return Error(HttpStatusCode.NotFound, "Không tìm thấy task con.");
                }
                t.TaskItemId = id;
                return Ok(t);
            }
            catch (Exception ex)
            {
                return Error(HttpStatusCode.InternalServerError, ex.Message);
            }
        }

        // DELETE api/taskitems/{id}?userId=...
        [HttpDelete, Route("{id}")]
        public IHttpActionResult Delete(string id, string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Error(HttpStatusCode.BadRequest, "Thiếu userId.");

            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(@"
                    DELETE ti
                    FROM TaskItems ti
                    JOIN Tasks t ON t.TaskID = ti.TaskID
                    WHERE ti.TaskItemID = @id AND t.UserID = @userId", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@userId", userId);

                    if (cmd.ExecuteNonQuery() == 0)
                        return Error(HttpStatusCode.NotFound, "Không tìm thấy task con.");
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