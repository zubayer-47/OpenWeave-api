import { NextFunction, Request, Response } from 'express'
import prismadb from 'src/libs/prismadb'
import communityRepo from 'src/repos/community.repo'
import memberRepo from 'src/repos/member.repo'
import postRepo from 'src/repos/post.repo'
import { ErrorType } from 'src/types/custom'
import BaseController from './base.controller'
import MemberController from './member.controller'
import PostController from './post.controller'

class CommunityController extends BaseController {
  constructor() {
    super()
    this.configureRoutes()
  }

  private _getCommunities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const {} = req.params
    const {} = req.body
    const {} = req.query
    /**
     * Validation
     */
    const errors: ErrorType = {}
    // here gose your validation rules
    if (Object.keys(errors).length) {
      res.status(400).json(errors)
      return
    }
    try {
      // Your async code gose here...
    } catch (error) {
      next(error)
    }
  }

  private _createCommunity = async (req: Request, res: Response, next: NextFunction) => {
    const errors: ErrorType = {}
    const userId = req.user?.userId

    const { name, bio, rules } = req.body

    if (!name) errors.name = 'name is required'
    if (!bio) errors.bio = 'bio is required'
    if (!rules?.length) errors.rules = 'rules is required'

    // 2nd layer
    if (!errors?.name && name.length < 3) errors.name = 'name should contains 3 letters at least'
    else if (!errors.name && name.match(/[;]$/g)) errors.name = "You can't provide semicolon(;)"

    if (!errors?.bio && bio.length < 4) errors.bio = 'bio should contains 4 letters at least'
    if (!errors?.rules && !Array.isArray(rules)) errors.rules = 'Rules should be an Array of rules'

    if (Object.keys(errors).length) {
      res.status(400).json(errors).end()
      return
    }

    try {
      const existCommunity = await communityRepo.isExist(name)
      if (existCommunity) {
        res.status(400).json({ message: `community "${existCommunity.name}" already exist` })
        return
      }

      const community = await prismadb.community.create({
        data: {
          name,
          bio,
          rules: rules.toString()
        },
        select: {
          community_id: true
        }
      })

      // auto create member as admin of created community;
      const member = await prismadb.member.create({
        data: {
          user_id: userId,
          community_id: community.community_id,
          role: 'ADMIN',
          scopes: 'ROOT'
        },
        select: {
          member_id: true
        }
      })

      // is it valid or i should add a field to member table called { creator: community_id }
      // TODO: 3/1 sanitize this field or remove it
      await prismadb.community.update({
        where: {
          community_id: community.community_id
        },
        data: {
          createdBy: `${member.member_id}, ${userId}`
        }
      })

      res.status(201).json({ community_id: community.community_id, data: { name, bio, rules } })
    } catch (error) {
      next(error)
    }
  }

  private _getCommunityPosts = async (req: Request, res: Response, next: NextFunction) => {
    const communityId = req.params?.communityId
    const { page, limit } = req.query

    try {
      let posts: unknown

      if (page && limit) {
        posts = await postRepo.getPostsInCommunity(communityId, +page, +limit)
      } else {
        posts = await postRepo.getPostsInCommunity(communityId)
      }

      res.status(200).json(posts)
    } catch (error) {
      next(error)
    }
  }

  private _getPost = async (req: Request, res: Response, next: NextFunction) => {
    const post_id = req.params?.postId
    const community_id = req.params?.communityId

    const errors: ErrorType = {}

    if (!post_id) errors.message = 'content missing!'

    if (Object.keys(errors).length) {
      res.status(400).json(errors)
      return
    }

    try {
      const post = await postRepo.getPostInCommunity(post_id, community_id)
      if (!post) {
        res.status(404).json({ message: 'Post Not Found!' })
        return
      }

      res.status(200).json(post)
    } catch (error) {
      next(error)
    }
  }

  // private _getMemberPosts = async (_req: Request, _res: Response, _next: NextFunction) => {}

  // TODO: 3/1 refactor it before send production (add pagination where needs)
  private _communityInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const cid = req.query?.cid as string

    if (!cid) {
      res.status(400).json({ message: 'content missing' })
    }

    try {
      const communityInfo = await prismadb.community.findFirst({
        where: {
          community_id: cid
        },
        select: {
          community_id: true,
          name: true,
          rules: true,
          bio: true
        }
      })

      const membersCount = await memberRepo.numOfMembersInCommunity(cid)
      const postsCount = await postRepo.numOfPostsInCommunity(cid)

      res.status(200).json({ ...communityInfo, total_members: membersCount, total_posts: postsCount })
    } catch (error) {
      next(error)
    }
  }

  public configureRoutes(): void {
    /**
     * ? Community:
     * ? /communities (GET, POST)
     * ? /communities/:communityId (GET, PUT, DELETE)
     */

    // get all communities by pagination
    // TODO: 21/1 ->> make this method
    this.router.get('/', this._auth, this._getCommunities)

    // create community
    this.router.post('/', this._auth, this._createCommunity)

    this.router.get('/:communityId', this._auth, this._checkRoles, this._getCommunityPosts)
    this.router.get('/:communityId/post/:postId', this._auth, this._checkRoles, this._getPost)

    // add member
    // this.router.post('/:communityId', this._auth, this._joinMember)
    //   GET: queries: (page,limit, cid)
    // this.router.get('/:memberId', this._auth, this._getMemberPosts)

    // leave
    // this.router.delete('/leave', this._auth, this._checkRoles, this._leaveMember)

    // community info (query: communityId) -> testing purpose route
    this.router.get('/details/:communityId', this._auth, this._checkRoles, this._communityInfo)

    /**
     * ? Posts:
     * ? GET /communities/:communityId/posts: Get a list of posts in a specific community.
     * ? POST /communities/:communityId/posts: Create a new post in a specific community.
     * ?    * Include checks for user role or user existence.
     *
     * ? GET /communities/:communityId/posts/:postId: Get details of a specific post in a community.
     * ? PUT /communities/:communityId/posts/:postId: Update a post in a specific community.
     * ?    * Only the post creator or authorized community members can modify the post.
     *
     * ? DELETE /communities/:communityId/posts/:postId: Delete a post in a specific community.
     * ?    * Only the post creator or authorized community members can delete the post.
     */

    //? posts controller ->> <<-
    // Get a list of posts in a specific community with pagination.
    // TODO: 21/1 make it later with pagination
    this.router.get('/:communityId/posts', this._auth, this._checkRoles, PostController._getPosts)

    // Create a new post in a specific community.
    // TODO: 21/1 make it later
    this.router.post('/:communityId/posts', this._auth, this._checkRoles, PostController._createPost)

    // Get details of a specific post in a community.
    // TODO: 21/1 make it later
    this.router.get('/:communityId/posts/:postId', this._auth, this._checkRoles, PostController._getPost)

    // Update a post in a specific community. ->> Only the post creator or authorized community members can modify the post.
    // TODO: 21/1 make it later
    this.router.patch('/:communityId/posts/:postId', this._auth, this._checkRoles, PostController._getPost)

    // Delete a post in a specific community. ->> Only the post creator or authorized community members can delete the post.
    // TODO: 21/1 verify it later
    this.router.delete('/:communityId/posts/:postId', this._auth, this._checkRoles, PostController._deletePost)

    /**
     * ? Members:
     * ? GET /communities/:communityId/members: Get a list of community members.
     * ? POST /communities/:communityId/members: Add a user to the community.
     * ? DELETE /communities/:communityId/members/:userId: Remove a user from the community.
     */

    // Get a list of specific community members with pagination.
    // TODO: 21/1 verify it later
    this.router.get('/:communityId/members', this._auth, this._checkRoles, MemberController._getMembers)

    // Add/Join a user to the community.
    // TODO: 21/1 test it
    this.router.post('/:communityId/members', this._auth, this._checkRoles, MemberController._joinMember)

    // Remove/Leave a user from the community.
    // TODO: 21/1 test it
    this.router.post('/:communityId/members', this._auth, this._checkRoles, MemberController._leaveMember)
  }
}

export default new CommunityController()
