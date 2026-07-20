@Controller("users")
@UseGuards(AuthGuard)
@Roles("admin")
@Get("admin")
export class UsersController {
  list() { return []; }
}
