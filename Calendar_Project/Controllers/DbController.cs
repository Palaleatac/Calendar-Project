using Calendar_Project.Data;
using System.Data.SqlClient;
using System.Web.Http;

namespace YourProject.Controllers
{
    public class DbController : ApiController
    {
        [HttpGet]
        public IHttpActionResult Ping()
        {
            using (var conn = Db.Open())
            using (var cmd = new SqlCommand("SELECT COUNT (*) FROM Users", conn))
            {
                int n = (int)cmd.ExecuteScalar();
                return Ok(new { connected = true, users = n });
            }
        }
    }
}
//[HttpGet]
//public IHttpActionResult Ping()
//{
//    return Ok(new { pong = true });
//}