using System;
using System.Data.SqlClient;
using System.Net;
using System.Web.Http;
using Calendar_Project.Data;

namespace Calendar_Project.Controllers
{
    public class FreetimeDto
    {
        public string UserId { get; set; }
        public int Minutes { get; set; }
    }

    [RoutePrefix("api/users")]
    public class UsersController : ApiController
    {
        // GET api/users/freetime?userId=...
        [HttpGet, Route("freetime")]
        public IHttpActionResult GetFreetime(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Content(HttpStatusCode.BadRequest, new { error = "Thiếu userId." });
            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand("SELECT MiniumFreetime FROM Users WHERE UserID = @u", conn))
                {
                    cmd.Parameters.AddWithValue("@u", userId);
                    var v = cmd.ExecuteScalar();
                    if (v == null) return Content(HttpStatusCode.NotFound, new { error = "Không tìm thấy user." });
                    return Ok(new { minutes = v == DBNull.Value ? 0 : Convert.ToInt32(v) });
                }
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        // PUT api/users/freetime
        [HttpPut, Route("freetime")]
        public IHttpActionResult SetFreetime(FreetimeDto d)
        {
            if (d == null || string.IsNullOrWhiteSpace(d.UserId))
                return Content(HttpStatusCode.BadRequest, new { error = "Thiếu userId." });
            if (d.Minutes < 0 || d.Minutes > 1440)
                return Content(HttpStatusCode.BadRequest, new { error = "Freetime phải từ 0 đến 1440 phút." });
            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand("UPDATE Users SET MiniumFreetime = @m WHERE UserID = @u", conn))
                {
                    cmd.Parameters.AddWithValue("@m", d.Minutes);
                    cmd.Parameters.AddWithValue("@u", d.UserId);
                    if (cmd.ExecuteNonQuery() == 0)
                        return Content(HttpStatusCode.NotFound, new { error = "Không tìm thấy user." });
                }
                return Ok(new { minutes = d.Minutes });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }
    }
}