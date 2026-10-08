using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace Calendar_Project.Models
{
    public class TaskDto
    {
        public string TaskId { get; set; }
        public string UserId { get; set; }
        public string Title { get; set; }
        public string Descriptions { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public int Color { get; set; }
        public bool Complete { get; set; }
        public int? Reminder { get; set; }   // số phút trước giờ bắt đầu, null = không nhắc
    }
}