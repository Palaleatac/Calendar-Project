using System.Configuration;
using System.Data.SqlClient;

namespace Calendar_Project.Data
{
    public static class Db
    {
        private static readonly string ConnStr =
            ConfigurationManager.ConnectionStrings["CalendarDb"].ConnectionString;

        public static SqlConnection Open()
        {
            var conn = new SqlConnection(ConnStr);
            conn.Open();
            return conn;
        }
    }
}