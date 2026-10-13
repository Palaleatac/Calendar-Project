using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace Calendar_Project.Models
{
    public class TaskItemDto
    {
        public string TaskItemId { get; set; }
        public string TaskId { get; set; }
        public string UserId { get; set; }          // chỉ dùng để kiểm tra quyền, không lưu vào bảng TaskItems
        public string Content { get; set; }
        public int TaskItemWeight { get; set; } = 1;
        public bool Complete { get; set; }
    }
}