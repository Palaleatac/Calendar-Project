using Calendar_Project.Data;
using Calendar_Project.Models;
using System;
using System.Data.SqlClient;
using System.Security.Cryptography;
using System.Text;
using System.Web.Http;
using Calendar_Project.Data;
using Calendar_Project.Models;

namespace Calendar_Project.Controllers
{
    [RoutePrefix("api/auth")]
    public class AuthController : ApiController
    {
        // Hash = SHA256(UserID + password) -> 64 ký tự hex, vừa VARCHAR(70)
        private static string Hash(string userId, string password)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(userId + password));
                var sb = new StringBuilder();
                foreach (var b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        [HttpPost, Route("register")]
        public IHttpActionResult Register(AuthRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrEmpty(req.Password))
                return BadRequest("Thiếu username hoặc password.");

            var username = req.Username.Trim();
            if (username.Length > 50)
                return BadRequest("Username tối đa 50 ký tự.");
            if (req.Password.Length < 6)
                return BadRequest("Mật khẩu tối thiểu 6 ký tự.");

            try
            {
                using (var conn = Db.Open())
                {
                    using (var check = new SqlCommand("SELECT COUNT(*) FROM Users WHERE Username = @u", conn))
                    {
                        check.Parameters.AddWithValue("@u", username);
                        if ((int)check.ExecuteScalar() > 0)
                            return Content(System.Net.HttpStatusCode.Conflict, new { error = "Username đã tồn tại." });
                    }

                    var userId = Guid.NewGuid().ToString();
                    var hash = Hash(userId, req.Password);

                    using (var cmd = new SqlCommand(
                        "INSERT INTO Users (UserID, Username, PasswordHash, MiniumFreetime) VALUES (@id, @u, @h, 0)", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", userId);
                        cmd.Parameters.AddWithValue("@u", username);
                        cmd.Parameters.AddWithValue("@h", hash);
                        cmd.ExecuteNonQuery();
                    }

                    return Ok(new { userId = userId, username = username });
                }
            }
            catch (Exception ex)
            {
                return Content(System.Net.HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost, Route("login")]
        public IHttpActionResult Login(AuthRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrEmpty(req.Password))
                return BadRequest("Thiếu username hoặc password.");

            try
            {
                using (var conn = Db.Open())
                using (var cmd = new SqlCommand(
                    "SELECT UserID, PasswordHash FROM Users WHERE Username = @u", conn))
                {
                    cmd.Parameters.AddWithValue("@u", req.Username.Trim());
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            var userId = r.GetString(0);
                            var storedHash = r.GetString(1);
                            if (storedHash == Hash(userId, req.Password))
                                return Ok(new { userId = userId, username = req.Username.Trim() });
                        }
                    }
                }
                // Cùng một thông báo cho cả "sai user" và "sai mật khẩu"
                return Content(System.Net.HttpStatusCode.Unauthorized, new { error = "Sai username hoặc mật khẩu." });
            }
            catch (Exception ex)
            {
                return Content(System.Net.HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }
    }
}