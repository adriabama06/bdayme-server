import { get_user } from "../controller/user.js";
import redis_client from "../redis.js";

export default async function middleware_auth(req, res, next) {
    /**
     * @type {string | null}
     */
    const authorization = req.headers.authorization;

    if(!authorization || authorization.replace("Bearer ", "").length == 0) {
        return res.status(400).json({
            error: "This route requires authorization"
        });
    }

    const token = authorization.replace("Bearer ", "");

    const id = await redis_client.get(`tokens:${token}`);

    if(!id) {
        return res.status(400).json({
            error: "Invalid authorization"
        });
    }

    const user = await get_user(id);

    if(!user) {
        return res.status(500).json({
            error: "This user not exist in the database?"
        });
    }

    redis_client.expire(`tokens:${token}`, 7 * 24 * 3600, "NX"); // Reset token expire due to the usage

    req.user = user;
    req.token = token;

    next();
}